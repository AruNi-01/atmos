/**
 * Desktop Use client for Electron — spawns Atmos CLI capture/status.
 *
 * **CLI (ADR-005 / product rule):** sole runner is the canonical standalone
 * install at `~/.atmos/bin/atmos` (or `%USERPROFILE%\.atmos\bin\atmos.exe`).
 * Never use App-bundled, monorepo `target/`, or PATH fallbacks.
 *
 * **Engine pin:** App Resources `desktop-use/engine-manifest.json` via
 * `ATMOS_DESKTOP_USE_MANIFEST` (independent of where the CLI binary lives).
 *
 * **CLI floor for this Desktop build:** App Resources
 * `desktop-use/cli-requirement.json` (`min_cli_version`). Desktop Use only
 * prompts for CLI install/update when missing or below that floor — not when
 * a newer unrelated CLI exists on the release channel.
 */

import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/** Must match Rust `desktop_use::MANIFEST_ENV`. */
export const DESKTOP_USE_MANIFEST_ENV = "ATMOS_DESKTOP_USE_MANIFEST";

/** Structured error when the canonical CLI is missing. */
export const CLI_NOT_INSTALLED_CODE = "cli_not_installed";
/** Installed CLI is older than this Desktop package's min_cli_version. */
export const CLI_UPDATE_REQUIRED_CODE = "cli_update_required";

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

/** Canonical Atmos CLI probe (no network). */
export type AtmosCliProbe = {
  installed: boolean;
  path: string;
  version: string | null;
  code?: typeof CLI_NOT_INSTALLED_CODE | typeof CLI_UPDATE_REQUIRED_CODE;
};

/**
 * Desktop package CLI floor (no network, no "latest" channel).
 * `update_required` is true only when installed version is below min.
 */
export type DesktopUseCliStatus = AtmosCliProbe & {
  /** Min CLI version this Desktop package expects (from cli-requirement.json). */
  min_cli_version?: string | null;
  /** installed && (no min pin || version >= min). */
  meets_requirement?: boolean;
  /**
   * True only when CLI is present but below this package's min_cli_version.
   * Not the same as "a newer CLI exists on the release channel" (About uses that).
   */
  update_required?: boolean;
};

export type CliRequirementJson = {
  schema_version?: number;
  min_cli_version: string;
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
  /** Always present when returned from Electron client. */
  cli?: DesktopUseCliStatus;
};

function atmosBinName(): string {
  return process.platform === "win32" ? "atmos.exe" : "atmos";
}

/**
 * Canonical Atmos home: `~/.atmos` (Windows: `%USERPROFILE%\.atmos`).
 * Pass `home` only in tests to isolate the install root.
 */
export function atmosHomeDir(opts?: { home?: string }): string {
  return join(opts?.home ?? homedir(), ".atmos");
}

/** Sole product CLI path: `~/.atmos/bin/atmos`. */
export function canonicalAtmosCliPath(opts?: { home?: string }): string {
  return join(atmosHomeDir(opts), "bin", atmosBinName());
}

/**
 * Resolve the Atmos CLI binary path.
 *
 * Product rule: always the canonical install. No App Resources, no monorepo
 * target/, no bare PATH name.
 */
export function resolveAtmosCliPath(opts?: { home?: string }): string {
  return canonicalAtmosCliPath(opts);
}

export function isAtmosCliInstalled(opts?: { home?: string }): boolean {
  return existsSync(canonicalAtmosCliPath(opts));
}

/**
 * Semver-ish compare matching Rust `runtime_manager::version_gt`.
 * Compares numeric dotted segments before first `+` / `-`.
 */
export function versionGt(candidate: string, current: string): boolean {
  const candidateParts = versionParts(candidate);
  const currentParts = versionParts(current);
  const len = Math.max(candidateParts.length, currentParts.length);
  for (let i = 0; i < len; i++) {
    const a = candidateParts[i] ?? 0;
    const b = currentParts[i] ?? 0;
    if (a !== b) return a > b;
  }
  return false;
}

function versionParts(version: string): number[] {
  const core = version.split(/[+-]/)[0] ?? version;
  return core.split(".").map((part) => {
    const n = Number.parseInt(part, 10);
    return Number.isFinite(n) ? n : 0;
  });
}

/**
 * Local probe of the canonical CLI (exists + optional `--version`).
 * Does not hit the network. For Desktop Use update prompts use
 * {@link enrichCliStatusWithRequirement} (package min version), not R2 latest.
 */
export async function probeAtmosCli(opts?: {
  home?: string;
}): Promise<AtmosCliProbe> {
  const path = canonicalAtmosCliPath(opts);
  if (!existsSync(path)) {
    return {
      installed: false,
      path,
      version: null,
      code: CLI_NOT_INSTALLED_CODE,
    };
  }

  let version: string | null = null;
  try {
    const { stdout, stderr } = await execFileAsync(path, ["--version"], {
      timeout: 5_000,
      maxBuffer: 64 * 1024,
      env: process.env,
    });
    const text = `${stdout || ""}\n${stderr || ""}`.trim();
    // e.g. "atmos 2026.8.7" or "atmos-cli 2026.8.7"
    const m = text.match(/\b(\d{4}\.\d{1,2}\.\d{1,2}(?:[-.][0-9A-Za-z.]+)?)\b/);
    version = m?.[1] ?? (text || null);
  } catch {
    // Binary exists but failed to run — still "installed" for path purposes.
    version = null;
  }

  return { installed: true, path, version };
}

/**
 * Resolve this Desktop build's min CLI version pin.
 * Prefer App Resources; then monorepo manifest; then staged package resources.
 */
export function resolveCliRequirementPath(
  opts?: { resourcesPath?: string; repoRoot?: string | null },
): string | null {
  const resourcesPath =
    opts?.resourcesPath ??
    (typeof process.resourcesPath === "string" ? process.resourcesPath : "");
  if (resourcesPath) {
    const packaged = join(resourcesPath, "desktop-use", "cli-requirement.json");
    if (existsSync(packaged)) return packaged;
  }

  const root = opts?.repoRoot !== undefined ? opts.repoRoot : repoRootFromHere();
  if (root) {
    const monorepo = join(
      root,
      "crates",
      "desktop-use",
      "manifest",
      "cli-requirement.json",
    );
    if (existsSync(monorepo)) return monorepo;
  }

  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const staged = join(
      here,
      "..",
      "..",
      "resources",
      "desktop-use",
      "cli-requirement.json",
    );
    if (existsSync(staged)) return staged;
  } catch {
    /* ignore */
  }

  return null;
}

export function readCliRequirement(
  opts?: { resourcesPath?: string; repoRoot?: string | null },
): CliRequirementJson | null {
  const path = resolveCliRequirementPath(opts);
  if (!path) return null;
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as CliRequirementJson;
    if (
      typeof raw?.min_cli_version === "string" &&
      raw.min_cli_version.trim().length > 0
    ) {
      return {
        schema_version: raw.schema_version,
        min_cli_version: raw.min_cli_version.trim(),
      };
    }
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * Attach package min-version floor. Does not consult the global CLI release channel.
 */
export function enrichCliStatusWithRequirement(
  probe: AtmosCliProbe,
  opts?: { resourcesPath?: string; repoRoot?: string | null },
): DesktopUseCliStatus {
  const req = readCliRequirement(opts);
  const min = req?.min_cli_version ?? null;

  if (!probe.installed) {
    return {
      ...probe,
      min_cli_version: min,
      meets_requirement: false,
      update_required: false,
      code: CLI_NOT_INSTALLED_CODE,
    };
  }

  if (!min) {
    // No pin → any installed CLI is acceptable for this build.
    return {
      ...probe,
      min_cli_version: null,
      meets_requirement: true,
      update_required: false,
    };
  }

  const installedV = probe.version;
  // Unreadable version or min > installed → need update.
  const updateRequired =
    !installedV || versionGt(min, installedV);

  return {
    ...probe,
    min_cli_version: min,
    meets_requirement: !updateRequired,
    update_required: updateRequired,
    code: updateRequired ? CLI_UPDATE_REQUIRED_CODE : undefined,
  };
}

/** Probe + package floor in one call (IPC `atmos_cli_probe`). */
export async function probeAtmosCliWithRequirement(opts?: {
  home?: string;
  resourcesPath?: string;
  repoRoot?: string | null;
}): Promise<DesktopUseCliStatus> {
  const probe = await probeAtmosCli(opts);
  return enrichCliStatusWithRequirement(probe, opts);
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

function childEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  const manifest = resolveDesktopUseManifestPath();
  if (manifest) {
    env[DESKTOP_USE_MANIFEST_ENV] = manifest;
  }
  return env;
}

function cliNotInstalledError(_path: string): Error {
  // Product-facing copy: use the term "CLI", never filesystem paths.
  const err = new Error(
    "Atmos CLI is not installed. Open Settings → Desktop Use (or About) to install.",
  );
  (err as Error & { code?: string }).code = CLI_NOT_INSTALLED_CODE;
  return err;
}

function defaultDataDir(): string {
  return join(atmosHomeDir(), "desktop-use");
}

/** Soft status when CLI is missing or below package min — no ENOENT red text. */
function statusWhenCliUnavailable(cli: DesktopUseCliStatus): DesktopUseStatusJson {
  const reason = cli.update_required
    ? CLI_UPDATE_REQUIRED_CODE
    : CLI_NOT_INSTALLED_CODE;
  return {
    product: "Desktop Use",
    data_dir: defaultDataDir(),
    capture: {
      available: false,
      platform: process.platform,
      reason,
    },
    driver: {
      phase: "not_installed",
      installed: false,
      progress: null,
      error: null,
      engine_path: null,
      engine_version: null,
    },
    host_app_name: null,
    host_app_path: null,
    pinned_version: null,
    installed_version: null,
    update_available: false,
    prefs: {
      operation_border_enabled: true,
      highlight_idle_ms: 8000,
    },
    cli,
  };
}

export async function runDesktopUseJson(
  args: string[],
  timeoutMs = 20_000,
): Promise<unknown> {
  const cli = resolveAtmosCliPath();
  if (!existsSync(cli)) {
    throw cliNotInstalledError(cli);
  }
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
  const cli = await probeAtmosCliWithRequirement();
  if (!cli.installed || cli.update_required) {
    return statusWhenCliUnavailable(cli);
  }
  const status = (await runDesktopUseJson(["status"])) as DesktopUseStatusJson;
  return {
    ...status,
    cli,
  };
}

export async function desktopUseDriverEnsure(force = false): Promise<unknown> {
  const args = ["driver", "ensure"];
  if (force) args.push("--force");
  const result = await runDesktopUseJson(args, 120_000);
  // CLI rebrand uses the CLI's embedded icns (often stale). Desktop's
  // current app icon is the source of truth — re-apply after ensure.
  if (process.platform === "darwin") {
    try {
      const { ensureDesktopUseHostBranding } = await import(
        "./host-branding.js"
      );
      await ensureDesktopUseHostBranding();
    } catch {
      /* branding is best-effort */
    }
  }
  return result;
}

export async function desktopUseDriverStop(timeoutMs = 8_000): Promise<unknown> {
  return runDesktopUseJson(["driver", "stop"], timeoutMs);
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
  const cli = await probeAtmosCliWithRequirement();
  if (!cli.installed) {
    return {
      engine_installed: false,
      engine_ready: false,
      accessibility: null,
      screen_recording: null,
      cli_installed: false,
      cli_meets_requirement: false,
      cli_path: cli.path,
      cli_min_version: cli.min_cli_version ?? null,
      notes: [CLI_NOT_INSTALLED_CODE],
    };
  }
  if (cli.update_required) {
    return {
      engine_installed: false,
      engine_ready: false,
      accessibility: null,
      screen_recording: null,
      cli_installed: true,
      cli_meets_requirement: false,
      cli_path: cli.path,
      cli_version: cli.version,
      cli_min_version: cli.min_cli_version ?? null,
      notes: [CLI_UPDATE_REQUIRED_CODE],
    };
  }
  const doctor = (await runDesktopUseJson(["doctor"])) as Record<
    string,
    unknown
  >;
  return {
    ...doctor,
    cli_installed: true,
    cli_meets_requirement: true,
    cli_path: cli.path,
    cli_version: cli.version,
    cli_min_version: cli.min_cli_version ?? null,
  };
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
