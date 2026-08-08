/**
 * AppShot dual-shift under Atmos Desktop Use host identity.
 *
 * When the control engine is installed, dual-shift is injected into the host
 * serve process (DYLD_INSERT) so Accessibility for **Atmos Desktop Use** covers
 * both capture and the Left⇧+Right⇧ shortcut — no separate Atmos grant.
 *
 * Chord protocol: Unix socket NDJSON at ~/.atmos/desktop-use/appshot-shift.sock
 */

import { copyFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { createConnection, type Socket } from "node:net";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { app } from "electron";
import { mainLog } from "../main-log.js";

export type HostShiftHandle = { stop: () => void; mode: "host-inject" };

export function appshotShiftSocketPath(): string {
  const atmosHome = process.env.ATMOS_HOME?.trim();
  if (atmosHome) {
    return join(atmosHome, "desktop-use", "appshot-shift.sock");
  }
  return join(homedir(), ".atmos", "desktop-use", "appshot-shift.sock");
}

export function appshotShiftInjectInstallPath(): string {
  const atmosHome = process.env.ATMOS_HOME?.trim();
  if (atmosHome) {
    return join(atmosHome, "desktop-use", "lib", "libatmos_appshot_shift_inject.dylib");
  }
  return join(
    homedir(),
    ".atmos",
    "desktop-use",
    "lib",
    "libatmos_appshot_shift_inject.dylib",
  );
}

function resolveBundledInjectDylib(): string | null {
  const name = "libatmos_appshot_shift_inject.dylib";
  const candidates: string[] = [];
  try {
    const appPath = app.getAppPath();
    if (appPath.endsWith(".asar")) {
      candidates.push(join(`${appPath}.unpacked`, "resources", "bin", name));
    }
    candidates.push(join(appPath, "resources", "bin", name));
    if (typeof process.resourcesPath === "string" && process.resourcesPath) {
      candidates.push(join(process.resourcesPath, "bin", name));
      candidates.push(
        join(process.resourcesPath, "app.asar.unpacked", "resources", "bin", name),
      );
    }
  } catch {
    /* app not ready */
  }
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    candidates.push(join(here, "../../resources/bin", name));
    candidates.push(join(here, "../resources/bin", name));
  } catch {
    /* ignore */
  }
  candidates.push(join(process.cwd(), "apps/desktop-electron/resources/bin", name));
  candidates.push(join(process.cwd(), "resources/bin", name));
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return null;
}

/**
 * Copy packaged inject dylib into ~/.atmos/desktop-use/lib so host serve can
 * DYLD_INSERT it. Returns true when the install path exists after the call.
 */
export function ensureHostShiftInjectInstalled(): boolean {
  if (process.platform !== "darwin") return false;
  const dest = appshotShiftInjectInstallPath();
  const src = resolveBundledInjectDylib();
  if (!src) {
    mainLog(
      "[appshot-host-shift] inject dylib missing from package resources",
      "warn",
    );
    return existsSync(dest);
  }
  try {
    mkdirSync(dirname(dest), { recursive: true });
    let needCopy = !existsSync(dest);
    if (!needCopy) {
      try {
        needCopy = statSync(src).size !== statSync(dest).size;
      } catch {
        needCopy = true;
      }
    }
    if (needCopy) {
      copyFileSync(src, dest);
      mainLog(`[appshot-host-shift] installed inject → ${dest}`);
    }
    return existsSync(dest);
  } catch (e) {
    mainLog(
      `[appshot-host-shift] install inject failed: ${e instanceof Error ? e.message : String(e)}`,
      "error",
    );
    return existsSync(dest);
  }
}

/**
 * Connect to host inject chord socket. Retries briefly while host serve starts.
 */
export function startHostShiftSocketListener(
  onChord: () => void,
  options: { timeoutMs?: number } = {},
): Promise<HostShiftHandle | null> {
  if (process.platform !== "darwin") return Promise.resolve(null);
  const sockPath = appshotShiftSocketPath();
  const timeoutMs = options.timeoutMs ?? 8_000;
  const started = Date.now();

  return new Promise((resolve) => {
    let settled = false;
    let socket: Socket | null = null;
    let buf = "";
    let stopped = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const finishNull = () => {
      if (settled) return;
      settled = true;
      resolve(null);
    };

    const finishOk = (handle: HostShiftHandle) => {
      if (settled) return;
      settled = true;
      resolve(handle);
    };

    const cleanup = () => {
      stopped = true;
      if (retryTimer) clearTimeout(retryTimer);
      try {
        socket?.destroy();
      } catch {
        /* ignore */
      }
      socket = null;
    };

    const handleLine = (line: string) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      let msg: { t?: string; ax?: boolean; msg?: string };
      try {
        msg = JSON.parse(trimmed) as typeof msg;
      } catch {
        return;
      }
      if (msg.t === "chord") {
        try {
          onChord();
        } catch (e) {
          mainLog(
            `[appshot-host-shift] onChord error: ${e instanceof Error ? e.message : String(e)}`,
            "error",
          );
        }
      } else if (msg.t === "error") {
        mainLog(`[appshot-host-shift] ${msg.msg ?? "error"}`, "error");
      }
    };

    const tryConnect = () => {
      if (stopped) return;
      if (Date.now() - started > timeoutMs) {
        mainLog(
          `[appshot-host-shift] socket not ready within ${timeoutMs}ms (${sockPath})`,
          "warn",
        );
        cleanup();
        finishNull();
        return;
      }
      if (!existsSync(sockPath)) {
        retryTimer = setTimeout(tryConnect, 200);
        return;
      }
      const s = createConnection(sockPath);
      socket = s;
      s.setEncoding("utf8");
      s.on("connect", () => {
        mainLog(`[appshot-host-shift] connected ${sockPath}`);
        finishOk({
          mode: "host-inject",
          stop: () => cleanup(),
        });
      });
      s.on("data", (chunk: string) => {
        buf += chunk;
        let idx: number;
        while ((idx = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, idx);
          buf = buf.slice(idx + 1);
          handleLine(line);
        }
      });
      s.on("error", () => {
        try {
          s.destroy();
        } catch {
          /* ignore */
        }
        socket = null;
        if (!settled) {
          retryTimer = setTimeout(tryConnect, 250);
        }
      });
      s.on("close", () => {
        socket = null;
        if (!stopped && settled) {
          // Host restarted — try reconnect for the life of the handle.
          retryTimer = setTimeout(tryConnect, 400);
        }
      });
    };

    tryConnect();
  });
}

/**
 * Ensure inject is installed and host daemon is (re)started so the inject loads.
 */
export async function ensureHostShiftReady(): Promise<boolean> {
  if (process.platform !== "darwin") return false;
  const installed = ensureHostShiftInjectInstalled();
  if (!installed) return false;

  try {
    const client = await import("../desktop-use/client.js");
    const st = await client.desktopUseStatus();
    if (!st?.driver?.installed) return false;

    // Restart host when chord socket is missing so DYLD_INSERT loads inject.
    // Existing serve (launched via open -a or without inject) has no socket.
    const sock = appshotShiftSocketPath();
    if (!existsSync(sock)) {
      mainLog("[appshot-host-shift] chord socket missing — restarting host with inject");
      try {
        await client.desktopUseDriverStop();
      } catch {
        /* ignore */
      }
      // doctor/ensure_daemon restarts serve (with inject when CLI is new enough).
      try {
        await client.desktopUseDoctor();
      } catch {
        /* ignore */
      }
      try {
        await client.desktopUseDriverEnsure(false);
      } catch {
        /* ignore */
      }
      // Warm engine so serve stays up for the chord socket.
      try {
        await client.desktopUseDriveVerify();
      } catch {
        /* ignore */
      }
    }
    return true;
  } catch (e) {
    mainLog(
      `[appshot-host-shift] ensure host failed: ${e instanceof Error ? e.message : String(e)}`,
      "warn",
    );
    return false;
  }
}
