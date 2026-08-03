/**
 * Desktop Use client for Electron — spawns Atmos CLI capture/status.
 * AppShot capture must go through this surface (not direct osascript/screencapture).
 */

import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type DesktopUseCaptureJson = {
  ok: boolean;
  app_name?: string | null;
  window_title?: string | null;
  bundle_id?: string | null;
  process_id?: number | null;
  bounds?: {
    x: number;
    y: number;
    width: number;
    height: number;
  } | null;
  png_base64?: string | null;
  png_path?: string | null;
  context_markdown?: string;
  quality?: string;
  warnings?: string[];
  error?: string | null;
};

export type DesktopUseStatusJson = {
  product: string;
  data_dir: string;
  capture: { available: boolean; platform: string; reason?: string | null };
  driver: {
    phase: string;
    installed: boolean;
    progress?: number | null;
    error?: string | null;
    engine_path?: string | null;
  };
};

function repoRootFromHere(): string | null {
  try {
    let dir = dirname(fileURLToPath(import.meta.url));
    for (let i = 0; i < 8; i++) {
      if (existsSync(join(dir, "Cargo.toml")) && existsSync(join(dir, "apps", "cli"))) {
        return dir;
      }
      const parent = dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  } catch {
    /* ignore */
  }
  return null;
}

/** Resolve `atmos` CLI binary for Desktop Use commands. */
export function resolveAtmosCliPath(): string {
  if (process.env.ATMOS_CLI_PATH && existsSync(process.env.ATMOS_CLI_PATH)) {
    return process.env.ATMOS_CLI_PATH;
  }
  const home = process.env.HOME ?? "";
  const candidates = [
    join(home, ".atmos", "bin", "atmos"),
    join(home, ".cargo", "bin", "atmos"),
  ];
  const root = repoRootFromHere();
  if (root) {
    candidates.unshift(
      join(root, "target", "debug", "atmos"),
      join(root, "target", "release", "atmos"),
    );
  }
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return "atmos";
}

export async function runDesktopUseJson(
  args: string[],
  timeoutMs = 20_000,
): Promise<unknown> {
  const cli = resolveAtmosCliPath();
  const { stdout, stderr } = await execFileAsync(cli, ["desktop-use", ...args, "--json"], {
    timeout: timeoutMs,
    maxBuffer: 32 * 1024 * 1024,
    env: { ...process.env },
  });
  const text = (stdout || "").trim() || (stderr || "").trim();
  if (!text) {
    throw new Error("Desktop Use returned empty output");
  }
  // CLI may print human lines; find last JSON object
  const start = text.indexOf("{");
  const jsonText = start >= 0 ? text.slice(start) : text;
  return JSON.parse(jsonText) as unknown;
}

export async function desktopUseStatus(): Promise<DesktopUseStatusJson> {
  return (await runDesktopUseJson(["status"])) as DesktopUseStatusJson;
}

export async function desktopUseDriverEnsure(force = false): Promise<unknown> {
  const args = ["driver", "ensure"];
  if (force) args.push("--force");
  return runDesktopUseJson(args, 120_000);
}

export async function desktopUseDriverStop(): Promise<unknown> {
  return runDesktopUseJson(["driver", "stop"]);
}

export async function desktopUseDriverUninstall(): Promise<unknown> {
  return runDesktopUseJson(["driver", "uninstall"]);
}

export async function desktopUseCapture(): Promise<DesktopUseCaptureJson> {
  return (await runDesktopUseJson(["capture"], 25_000)) as DesktopUseCaptureJson;
}
