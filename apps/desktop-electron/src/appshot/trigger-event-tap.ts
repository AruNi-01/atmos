/**
 * Dual-shift: dedicated helper PROCESS (not in-process dylib thread).
 *
 * Why a separate process?
 * Electron GUI process is throttled / App-Napped when another app is frontmost,
 * so in-process taps only feel reliable while Atmos itself is focused.
 *
 * Helper is the SAME Atmos binary under ELECTRON_RUN_AS_NODE → same
 * Accessibility TCC identity as the GUI app (no second permission grant).
 *
 * Protocol: see shift-helper-main.ts
 */

import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { app } from "electron";
import { mainLog } from "../main-log.js";

export type TapHandle = { stop: () => void };

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

/**
 * Start dual-shift listener via helper process. onChord on Electron main thread.
 */
export function startShiftFlagsEventTap(onChord: () => void): TapHandle | null {
  if (process.platform !== "darwin") return null;

  const script = resolveHelperScript();
  if (!script) return null;

  const electronPath = process.execPath;
  mainLog(
    `[appshot-tap] spawning helper process exec=${electronPath} script=${script}`,
  );

  let child: ChildProcessWithoutNullStreams;
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

  let stopped = false;
  let ready = false;
  let buf = "";
  let restartAttempts = 0;
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
      mainLog(`[appshot-tap] helper non-json: ${trimmed.slice(0, 160)}`);
      return;
    }
    switch (msg.t) {
      case "boot":
        mainLog(
          `[appshot-tap] helper boot ax=${msg.ax} ${trimmed.slice(0, 200)}`,
        );
        break;
      case "ready":
        ready = true;
        mainLog(
          `[appshot-tap] helper READY ax=${msg.ax} (global dual-shift, separate process)`,
        );
        break;
      case "edge":
        mainLog(
          `[appshot-tap] edge side=${msg.side} down=${msg.down} keycode=0x${Number(msg.keycode ?? 0).toString(16)} n=${msg.n}`,
        );
        break;
      case "chord":
        mainLog("[appshot-tap] CHORD (helper process)");
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
      case "exit":
        mainLog("[appshot-tap] helper exit msg");
        break;
      default:
        mainLog(`[appshot-tap] helper: ${trimmed.slice(0, 200)}`);
    }
  };

  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    buf += chunk;
    let idx: number;
    while ((idx = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, idx);
      buf = buf.slice(idx + 1);
      handleLine(line);
    }
  });
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk: string) => {
    const t = chunk.trim();
    if (t) mainLog(`[appshot-tap] helper stderr: ${t.slice(0, 400)}`, "error");
  });

  child.on("exit", (code, signal) => {
    mainLog(
      `[appshot-tap] helper process exit code=${code} signal=${signal} ready=${ready}`,
    );
    if (!stopped && restartAttempts < 5) {
      restartAttempts += 1;
      mainLog(
        `[appshot-tap] will not auto-respawn here (parent trigger owns restarts) attempts=${restartAttempts}`,
      );
    }
  });

  // Do not busy-wait on the Electron main thread — READY arrives async via stdout.
  child.once("spawn", () => {
    mainLog(`[appshot-tap] helper pid=${child.pid}`);
  });

  return {
    stop: () => {
      stopped = true;
      try {
        child.kill("SIGTERM");
      } catch {
        /* ignore */
      }
      // Force kill if needed
      setTimeout(() => {
        try {
          if (!child.killed) child.kill("SIGKILL");
        } catch {
          /* ignore */
        }
      }, 500);
      mainLog("[appshot-tap] helper stop requested");
    },
  };
}

export function resetEventTapNativeForTest(): void {
  /* no in-process cache */
}
