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

  child.on("exit", () => {
    /* parent trigger owns restarts */
  });

  return {
    stop: () => {
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
    },
  };
}

export function resetEventTapNativeForTest(): void {
  /* no in-process cache */
}
