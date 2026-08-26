/**
 * AppShot dual-shift under Atmos Desktop Use host identity.
 *
 * When the control engine is installed, dual-shift is injected into the host
 * serve process (DYLD_INSERT) so Accessibility for **Atmos Desktop Use** covers
 * both capture and the Left⇧+Right⇧ shortcut — no separate Atmos grant.
 *
 * Socket protocol: Unix socket NDJSON at ~/.atmos/desktop-use/appshot-shift.sock
 *   {"t":"chord"} / {"t":"ready","ax":bool} / {"t":"digit","digit":3-6}
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

/** True when something is accept()ing on the chord socket (not a stale file). */
export function probeHostShiftSocket(
  sockPath: string = appshotShiftSocketPath(),
  timeoutMs = 500,
): Promise<boolean> {
  if (process.platform !== "darwin") return Promise.resolve(false);
  if (!existsSync(sockPath)) return Promise.resolve(false);
  return new Promise((resolve) => {
    const s = createConnection(sockPath);
    let done = false;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      try {
        s.destroy();
      } catch {
        /* ignore */
      }
      resolve(ok);
    };
    const t = setTimeout(() => finish(false), timeoutMs);
    s.once("connect", () => {
      clearTimeout(t);
      finish(true);
    });
    s.once("error", () => {
      clearTimeout(t);
      finish(false);
    });
  });
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
export function ensureHostShiftInjectInstalled(): {
  installed: boolean;
  replaced: boolean;
} {
  if (process.platform !== "darwin") return { installed: false, replaced: false };
  const dest = appshotShiftInjectInstallPath();
  const src = resolveBundledInjectDylib();
  if (!src) {
    mainLog(
      "[appshot-host-shift] inject dylib missing from package resources",
      "warn",
    );
    return { installed: existsSync(dest), replaced: false };
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
    return { installed: existsSync(dest), replaced: needCopy && existsSync(dest) };
  } catch (e) {
    mainLog(
      `[appshot-host-shift] install inject failed: ${e instanceof Error ? e.message : String(e)}`,
      "error",
    );
    return { installed: existsSync(dest), replaced: false };
  }
}

/**
 * Connect to host inject chord socket.
 *
 * - Initial connect: retry until `timeoutMs`, then resolve null.
 * - After a successful connect: reconnect forever on drop (host restart must
 *   not kill the listener — previous bug applied the initial timeout to
 *   reconnect and called cleanup(), leaving dual-shift permanently dead).
 */
export function startHostShiftSocketListener(
  onChord: () => void,
  options: {
    timeoutMs?: number;
    onDigit?: (digit: number) => void;
    retryForever?: boolean;
  } = {},
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
    let connecting = false;

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
      if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }
      try {
        socket?.removeAllListeners();
        socket?.destroy();
      } catch {
        /* ignore */
      }
      socket = null;
      connecting = false;
    };

    const scheduleRetry = (ms: number) => {
      if (stopped) return;
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = setTimeout(() => {
        retryTimer = null;
        tryConnect();
      }, ms);
    };

    const handleLine = (line: string) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      let msg: { t?: string; ax?: boolean; msg?: string; digit?: number };
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
      } else if (
        msg.t === "digit" &&
        typeof msg.digit === "number" &&
        msg.digit >= 3 &&
        msg.digit <= 6
      ) {
        try {
          options.onDigit?.(msg.digit);
        } catch (e) {
          mainLog(
            `[appshot-host-shift] onDigit error: ${e instanceof Error ? e.message : String(e)}`,
            "error",
          );
        }
      } else if (msg.t === "error") {
        mainLog(`[appshot-host-shift] ${msg.msg ?? "error"}`, "error");
      }
    };

    const tryConnect = () => {
      if (stopped || connecting) return;

      // Initial-connect deadline only. Reconnect after success never times out.
      if (
        !settled &&
        !options.retryForever &&
        Date.now() - started > timeoutMs
      ) {
        mainLog(
          `[appshot-host-shift] socket not ready within ${timeoutMs}ms (${sockPath})`,
          "warn",
        );
        finishNull();
        return;
      }

      if (!existsSync(sockPath)) {
        scheduleRetry(settled ? 500 : 200);
        return;
      }

      connecting = true;
      const s = createConnection(sockPath);
      socket = s;
      s.setEncoding("utf8");
      let dropped = false;

      s.on("connect", () => {
        connecting = false;
        buf = "";
        if (settled) {
          mainLog(`[appshot-host-shift] reconnected ${sockPath}`);
        } else {
          mainLog(`[appshot-host-shift] connected ${sockPath}`);
          finishOk({
            mode: "host-inject",
            stop: () => cleanup(),
          });
        }
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

      const onDrop = (why: string) => {
        if (dropped) return;
        dropped = true;
        connecting = false;
        if (socket === s) socket = null;
        try {
          s.removeAllListeners();
          s.destroy();
        } catch {
          /* ignore */
        }
        if (stopped) return;
        if (!settled) {
          scheduleRetry(250);
          return;
        }
        mainLog(
          `[appshot-host-shift] connection dropped (${why}) — reconnecting`,
          "warn",
        );
        scheduleRetry(400);
      };

      s.on("error", () => onDrop("error"));
      s.on("close", () => onDrop("close"));
    };

    tryConnect();
  });
}

/**
 * Ensure inject is installed and host daemon is (re)started so the inject loads.
 */
export async function ensureHostShiftReady(): Promise<boolean> {
  if (process.platform !== "darwin") return false;
  const { installed, replaced } = ensureHostShiftInjectInstalled();
  if (!installed) return false;

  try {
    const client = await import("../desktop-use/client.js");
    const st = await client.desktopUseStatus();
    if (!st?.driver?.installed) return false;

    // Restart host when chord socket is missing so DYLD_INSERT loads inject.
    // Existing serve (launched via open -a or without inject) has no socket.
    // Probe with a brief connect — a stale sock file after crash looks "present"
    // to existsSync but is not accept()ing.
    // Also restart when we just replaced the inject dylib so the new tap loads.
    const sock = appshotShiftSocketPath();
    const live = await probeHostShiftSocket(sock, 400);
    if (!live || replaced) {
      mainLog(
        replaced
          ? "[appshot-host-shift] inject updated — restarting host with inject"
          : "[appshot-host-shift] chord socket missing/stale — restarting host with inject",
      );
      try {
        await client.desktopUseDriverStop();
      } catch {
        /* ignore */
      }
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
