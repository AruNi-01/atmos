/**
 * Desktop Use client for Electron — spawns Atmos CLI capture/status.
 *
 * **Pin authority (optimal design):** App Resources
 * `desktop-use/engine-manifest.json` via `ATMOS_DESKTOP_USE_MANIFEST`.
 * **Runner:** prefer App-bundled `atmos` (same Desktop build), not PATH.
 * AppShot capture must go through this surface (not direct osascript/screencapture).
 */

import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/** Must match Rust `desktop_use::MANIFEST_ENV`. */
export const DESKTOP_USE_MANIFEST_ENV = "ATMOS_DESKTOP_USE_MANIFEST";

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

export type DesktopUsePrefsJson = {
  operation_border_enabled: boolean;
  highlight_idle_ms: number;
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
    engine_version?: string | null;
  };
  host_app_name?: string | null;
  host_app_path?: string | null;
  pinned_version?: string | null;
  installed_version?: string | null;
  update_available?: boolean;
  prefs?: DesktopUsePrefsJson;
};

function isPackagedElectron(): boolean {
  // electron app.isPackaged is unavailable in pure Node unit tests; use resourcesPath heuristics.
  const rp = typeof process.resourcesPath === "string" ? process.resourcesPath : "";
  if (!rp) return false;
  // Dev Electron still sets resourcesPath under the electron.app framework — require our stage.
  return (
    existsSync(join(rp, "runtime", "current")) ||
    existsSync(join(rp, "desktop-use", "engine-manifest.json")) ||
    existsSync(join(rp, "bin", "atmos")) ||
    existsSync(join(rp, "bin", "atmos.exe"))
  );
}

function repoRootFromHere(): string | null {
  try {
    let dir = dirname(fileURLToPath(import.meta.url));
    for (let i = 0; i < 10; i++) {
      if (
        existsSync(join(dir, "Cargo.toml")) &&
        existsSync(join(dir, "apps", "cli"))
      ) {
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

function atmosBinName(): string {
  return process.platform === "win32" ? "atmos.exe" : "atmos";
}

/**
 * Authoritative engine pin for this Desktop process.
 * Prefer App Resources; then monorepo crates/desktop-use/manifest; then env.
 */
export function resolveDesktopUseManifestPath(
  opts?: { resourcesPath?: string; repoRoot?: string | null },
): string | null {
  if (
    process.env[DESKTOP_USE_MANIFEST_ENV] &&
    existsSync(process.env[DESKTOP_USE_MANIFEST_ENV]!)
  ) {
    return process.env[DESKTOP_USE_MANIFEST_ENV]!;
  }

  const resourcesPath =
    opts?.resourcesPath ??
    (typeof process.resourcesPath === "string" ? process.resourcesPath : "");
  if (resourcesPath) {
    const packaged = join(resourcesPath, "desktop-use", "engine-manifest.json");
    if (existsSync(packaged)) return packaged;
  }

  const root = opts?.repoRoot !== undefined ? opts.repoRoot : repoRootFromHere();
  if (root) {
    const monorepo = join(
      root,
      "crates",
      "desktop-use",
      "manifest",
      "default.json",
    );
    if (existsSync(monorepo)) return monorepo;
  }

  // Staged next to electron app resources during package prepare (dev package tree)
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const staged = join(
      here,
      "..",
      "..",
      "resources",
      "desktop-use",
      "engine-manifest.json",
    );
    if (existsSync(staged)) return staged;
  } catch {
    /* ignore */
  }

  return null;
}

/**
 * Resolve `atmos` CLI for Desktop Use.
 *
 * Production order: App Resources only (same Desktop build as pin).
 * Dev order: ATMOS_CLI_PATH → monorepo target → package resources → last-resort PATH.
 */
export function resolveAtmosCliPath(opts?: {
  resourcesPath?: string;
  repoRoot?: string | null;
  packaged?: boolean;
}): string {
  if (process.env.ATMOS_CLI_PATH && existsSync(process.env.ATMOS_CLI_PATH)) {
    return process.env.ATMOS_CLI_PATH;
  }

  const bin = atmosBinName();
  const resourcesPath =
    opts?.resourcesPath ??
    (typeof process.resourcesPath === "string" ? process.resourcesPath : "");
  const packaged = opts?.packaged ?? isPackagedElectron();

  const packagedCandidates: string[] = [];
  if (resourcesPath) {
    packagedCandidates.push(
      join(resourcesPath, "bin", bin),
      join(resourcesPath, "runtime", "current", "bin", bin),
    );
  }

  if (packaged) {
    for (const c of packagedCandidates) {
      if (existsSync(c)) return c;
    }
    // Packaged but missing staged CLI — fail loud rather than use stale PATH pin.
    return packagedCandidates[0] ?? bin;
  }

  // Development: monorepo build products (must be rebuilt after pin changes).
  const root = opts?.repoRoot !== undefined ? opts.repoRoot : repoRootFromHere();
  const devCandidates: string[] = [];
  if (root) {
    devCandidates.push(
      join(root, "target", "debug", bin),
      join(root, "target", "release", bin),
    );
  }
  // Local electron resources after prepare-package
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    devCandidates.push(
      join(here, "..", "..", "resources", "runtime", "current", "bin", bin),
      join(here, "..", "..", "resources", "bin", bin),
    );
  } catch {
    /* ignore */
  }
  for (const c of [...devCandidates, ...packagedCandidates]) {
    if (existsSync(c)) return c;
  }

  // Last resort for bare dev shells only.
  return bin;
}

function childEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  const manifest = resolveDesktopUseManifestPath();
  if (manifest) {
    env[DESKTOP_USE_MANIFEST_ENV] = manifest;
  }
  return env;
}

export async function runDesktopUseJson(
  args: string[],
  timeoutMs = 20_000,
): Promise<unknown> {
  const cli = resolveAtmosCliPath();
  const { stdout, stderr } = await execFileAsync(
    cli,
    ["desktop-use", ...args, "--json"],
    {
      timeout: timeoutMs,
      maxBuffer: 32 * 1024 * 1024,
      env: childEnv(),
    },
  );
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

export async function desktopUseDriverRestart(): Promise<unknown> {
  return runDesktopUseJson(["driver", "restart"], 30_000);
}

export async function desktopUseDriverCheck(): Promise<unknown> {
  return runDesktopUseJson(["driver", "check"], 15_000);
}

export async function desktopUseDriverUninstall(): Promise<unknown> {
  return runDesktopUseJson(["driver", "uninstall"]);
}

export async function desktopUseCapture(): Promise<DesktopUseCaptureJson> {
  return (await runDesktopUseJson(["capture"], 25_000)) as DesktopUseCaptureJson;
}

export async function desktopUseDoctor(): Promise<unknown> {
  return runDesktopUseJson(["doctor"]);
}

export async function desktopUseGrantPermissions(
  target: "accessibility" | "screen_recording" | "all" = "all",
): Promise<unknown> {
  return runDesktopUseJson(
    ["driver", "grant-permissions", "--target", target],
    30_000,
  );
}

export async function desktopUseDriveVerify(): Promise<unknown> {
  return runDesktopUseJson(["drive", "verify"], 30_000);
}

export async function desktopUseDriveScreenshot(): Promise<unknown> {
  return runDesktopUseJson(["drive", "screenshot"], 45_000);
}

export async function desktopUsePrefsGet(): Promise<{ ok: boolean; prefs: DesktopUsePrefsJson }> {
  return (await runDesktopUseJson(["prefs", "get"])) as {
    ok: boolean;
    prefs: DesktopUsePrefsJson;
  };
}

export async function desktopUsePrefsSet(args: {
  operationBorder?: boolean;
  highlightIdleMs?: number;
}): Promise<{ ok: boolean; prefs: DesktopUsePrefsJson }> {
  const cliArgs = ["prefs", "set"];
  if (typeof args.operationBorder === "boolean") {
    cliArgs.push("--operation-border", args.operationBorder ? "true" : "false");
  }
  if (typeof args.highlightIdleMs === "number" && Number.isFinite(args.highlightIdleMs)) {
    cliArgs.push("--highlight-idle-ms", String(Math.max(0, Math.floor(args.highlightIdleMs))));
  }
  return (await runDesktopUseJson(cliArgs)) as {
    ok: boolean;
    prefs: DesktopUsePrefsJson;
  };
}

export async function desktopUseDriveSessionEnd(): Promise<unknown> {
  return runDesktopUseJson(["drive", "session-end"], 15_000);
}
