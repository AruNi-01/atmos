/**
 * Dual-shift listener for AppShot.
 *
 * Preferred path (control engine installed):
 *   Host inject inside Atmos Desktop Use serve — same Accessibility TCC as
 *   capture/control. Chord events arrive on a Unix socket.
 *
 * Fallback (engine not installed / inject unavailable):
 *   ELECTRON_RUN_AS_NODE helper under Atmos.app identity (legacy).
 */

import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { app } from "electron";
import { mainLog } from "../main-log.js";
import {
  ensureHostShiftReady,
  startHostShiftSocketListener,
  type HostShiftHandle,
} from "./host-shift.js";

export type TapHandle = { stop: () => void; mode?: "host-inject" | "electron-helper" };

function resolveHelperScript(): string | null {
  const candidates: string[] = [];
  try {
    const appPath = app.getAppPath();
    if (appPath.endsWith(".asar")) {
      candidates.push(
        join(`${appPath}.unpacked`, "dist", "shift-helper-main.js"),
      );
    }
    candidates.push(join(appPath, "dist", "shift-helper-main.js"));
  } catch {
    /* ignore */
  }
  if (typeof process.resourcesPath === "string" && process.resourcesPath) {
    candidates.push(
      join(
        process.resourcesPath,
        "app.asar.unpacked",
        "dist",
        "shift-helper-main.js",
      ),
    );
  }
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    if (here.includes(".asar")) {
      candidates.push(
        join(here.replace(".asar", ".asar.unpacked"), "shift-helper-main.js"),
      );
    }
    candidates.push(join(here, "shift-helper-main.js"));
  } catch {
    /* ignore */
  }
  candidates.push(join(process.cwd(), "dist", "shift-helper-main.js"));
  candidates.push(
    join(process.cwd(), "apps/desktop-electron/dist/shift-helper-main.js"),
  );
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  mainLog(
    `[appshot-tap] helper script missing; tried: ${candidates.slice(0, 5).join(" | ")}`,
    "error",
  );
  return null;
}

function startElectronShiftHelper(onChord: () => void): TapHandle | null {
  const script = resolveHelperScript();
  if (!script) return null;

  const electronPath = process.execPath;

  // stdin ignored → pipe stdout/stderr; narrow before use (spawn's generic type is loose).
  let child: ReturnType<typeof spawn>;
  try {
    child = spawn(electronPath, [script], {
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: "1",
        ELECTRON_NO_ATTACH_CONSOLE: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (e) {
    mainLog(
      `[appshot-tap] spawn failed: ${e instanceof Error ? e.message : String(e)}`,
      "error",
    );
    return null;
  }

  const { stdout, stderr } = child;
  if (!stdout || !stderr) {
    try {
      child.kill("SIGTERM");
    } catch {
      /* ignore */
    }
    mainLog("[appshot-tap] spawn missing stdio pipes", "error");
    return null;
  }

  let buf = "";
  let onChordRef = onChord;

  const handleLine = (line: string): void => {
    const trimmed = line.trim();
    if (!trimmed) return;
    let msg: {
      t?: string;
      side?: string;
      down?: boolean;
      keycode?: number;
      n?: number;
      msg?: string;
      ax?: boolean;
    };
    try {
      msg = JSON.parse(trimmed) as typeof msg;
    } catch {
      return;
    }
    switch (msg.t) {
      case "boot":
      case "ready":
      case "edge":
      case "exit":
        break;
      case "chord":
        try {
          onChordRef();
        } catch (e) {
          mainLog(
            `[appshot-tap] onChord error: ${e instanceof Error ? e.message : String(e)}`,
            "error",
          );
        }
        break;
      case "error":
        mainLog(`[appshot-tap] helper error: ${msg.msg}`, "error");
        break;
      default:
        break;
    }
  };

  stdout.setEncoding("utf8");
  stdout.on("data", (chunk: string) => {
    buf += chunk;
    let idx: number;
    while ((idx = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, idx);
      buf = buf.slice(idx + 1);
      handleLine(line);
    }
  });
  stderr.setEncoding("utf8");
  stderr.on("data", (chunk: string) => {
    const t = chunk.trim();
    if (t) mainLog(`[appshot-tap] helper stderr: ${t.slice(0, 400)}`, "error");
  });

  child.on("exit", () => {
    /* parent trigger owns restarts */
  });

  return {
    mode: "electron-helper",
    stop: () => {
      try {
        child.kill("SIGTERM");
      } catch {
        /* ignore */
      }
      setTimeout(() => {
        try {
          if (!child.killed) child.kill("SIGKILL");
        } catch {
          /* ignore */
        }
      }, 500);
    },
  };
}

async function hostEngineInstalled(): Promise<boolean> {
  try {
    const { desktopUseStatus } = await import("../desktop-use/client.js");
    const st = await desktopUseStatus();
    return Boolean(st?.driver?.installed);
  } catch {
    return false;
  }
}

/**
 * Start dual-shift listener. Prefer host inject when Desktop Use is installed.
 * Sync signature kept for call sites; host path arms asynchronously and returns
 * a handle that becomes live once the socket connects.
 */
export function startShiftFlagsEventTap(onChord: () => void): TapHandle | null {
  if (process.platform !== "darwin") return null;

  // Synchronous fallback immediately; host path upgrades when ready.
  // We arm host first asynchronously and only fall back if it fails.
  let active: TapHandle | null = null;
  let stopped = false;
  let hostHandle: HostShiftHandle | null = null;
  let electronHandle: TapHandle | null = null;

  const composite: TapHandle = {
    mode: "electron-helper",
    stop: () => {
      stopped = true;
      try {
        hostHandle?.stop();
      } catch {
        /* ignore */
      }
      try {
        electronHandle?.stop();
      } catch {
        /* ignore */
      }
      hostHandle = null;
      electronHandle = null;
      active = null;
    },
  };

  void (async () => {
    if (stopped) return;
    const useHost = await hostEngineInstalled();
    if (useHost) {
      const ready = await ensureHostShiftReady();
      if (stopped) return;
      if (ready) {
        const h = await startHostShiftSocketListener(onChord, {
          timeoutMs: 10_000,
        });
        if (stopped) {
          h?.stop();
          return;
        }
        if (h) {
          hostHandle = h;
          active = { stop: h.stop, mode: "host-inject" };
          composite.mode = "host-inject";
          mainLog("[appshot-tap] armed via Atmos Desktop Use host inject");
          return;
        }
        mainLog(
          "[appshot-tap] host inject socket unavailable — falling back to Atmos helper",
          "warn",
        );
      }
    }
    if (stopped) return;
    electronHandle = startElectronShiftHelper(onChord);
    if (electronHandle) {
      active = electronHandle;
      composite.mode = "electron-helper";
      mainLog("[appshot-tap] armed via Atmos Electron helper");
    }
  })();

  // Return composite immediately so ensureTriggerListener can keep a handle.
  // Until async arm finishes, stop() is still safe.
  active = composite;
  return composite;
}

export function resetEventTapNativeForTest(): void {
  /* no in-process cache */
}
