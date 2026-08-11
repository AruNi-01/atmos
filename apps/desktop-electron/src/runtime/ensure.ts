/**
 * Ensure / reuse shared Atmos Server from the Phase-0+ runtime layout
 * (apps/desktop/src-tauri/binaries/runtime/current — shared artifact location).
 */

import { execFileSync, spawn } from "node:child_process";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const DEFAULT_HOST = "127.0.0.1";
export const DEFAULT_PORT = 30303;

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Resolve monorepo root whether running from src/ or bundled dist/. */
function findRepoRoot(start: string): string {
  let dir = start;
  for (let i = 0; i < 8; i++) {
    if (
      existsSync(join(dir, "apps/desktop/src-tauri")) ||
      (existsSync(join(dir, "Justfile")) && existsSync(join(dir, "apps")))
    ) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  // Fallbacks: dist/ or src/runtime → walk up
  return join(start, "../../..");
}

export const REPO_ROOT = findRepoRoot(__dirname);

export function defaultRuntimeDir(): string {
  const fromEnv = process.env.ATMOS_ELECTRON_RUNTIME_DIR;
  if (fromEnv && existsSync(fromEnv)) return fromEnv;

  const candidates = [
    join(REPO_ROOT, "apps/desktop/src-tauri/binaries/runtime/current"),
    join(process.resourcesPath ?? "", "runtime/current"),
  ];
  for (const dir of candidates) {
    if (dir && existsSync(apiBinaryPath(dir))) return dir;
  }
  return candidates[0]!;
}

export function apiBinaryPath(runtimeDir: string): string {
  const names =
    process.platform === "win32"
      ? ["Atmos Server.exe", "atmos-api.exe", "api.exe"]
      : ["Atmos Server", "atmos-api", "api"];
  for (const name of names) {
    const p = join(runtimeDir, "bin", name);
    if (existsSync(p)) return p;
  }
  return join(runtimeDir, "bin", names[0]!);
}

export function webDir(runtimeDir: string): string {
  const bundled = join(runtimeDir, "web");
  if (existsSync(join(bundled, "index.html"))) return bundled;
  const webOut = join(REPO_ROOT, "apps/web/out");
  if (existsSync(join(webOut, "index.html"))) return webOut;
  return bundled;
}

export function systemSkillsDir(runtimeDir: string): string {
  return join(runtimeDir, "system-skills");
}

function atmosHome(): string {
  return process.env.ATMOS_HOME || join(homedir(), ".atmos");
}

function manifestPath(): string {
  // Align with runtime-manager layout: ~/.atmos/state/runtime_manifest.json
  return join(atmosHome(), "state", "runtime_manifest.json");
}

function runtimeLogPath(): string {
  return join(atmosHome(), "logs", "runtime-server.log");
}

function ensureLog(message: string): void {
  const line = `${new Date().toISOString()} [desktop-ensure] ${message}\n`;
  try {
    const path = join(atmosHome(), "logs", "desktop-main.log");
    mkdirSync(dirname(path), { recursive: true });
    appendFileSync(path, line, "utf8");
  } catch {
    /* ignore */
  }
  console.log(`[desktop-ensure] ${message}`);
}

/**
 * PIDs listening on TCP `port` (LISTEN). Best-effort; empty on failure.
 * Exported for unit tests of parsing.
 */
export function parseLsofPids(stdout: string): number[] {
  const pids = new Set<number>();
  for (const line of stdout.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || !/^\d+$/.test(t)) continue;
    const n = parseInt(t, 10);
    if (Number.isFinite(n) && n > 0) pids.add(n);
  }
  return [...pids];
}

export function listPidsListeningOnPort(port: number): number[] {
  try {
    if (process.platform === "win32") {
      // netstat -ano | findstr :port — keep simple for mac/linux first
      const out = execFileSync(
        "cmd",
        ["/c", `netstat -ano | findstr :${port}`],
        { encoding: "utf8", timeout: 3000 },
      );
      const pids = new Set<number>();
      for (const line of out.split(/\r?\n/)) {
        if (!/LISTENING/i.test(line)) continue;
        const parts = line.trim().split(/\s+/);
        const last = parts[parts.length - 1];
        const n = last ? parseInt(last, 10) : NaN;
        if (Number.isFinite(n) && n > 0) pids.add(n);
      }
      return [...pids];
    }
    const out = execFileSync(
      "lsof",
      ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"],
      { encoding: "utf8", timeout: 3000 },
    );
    return parseLsofPids(out);
  } catch {
    return [];
  }
}

function processCommandLine(pid: number): string {
  try {
    if (process.platform === "win32") {
      const out = execFileSync(
        "cmd",
        ["/c", `wmic process where processid=${pid} get CommandLine /value`],
        { encoding: "utf8", timeout: 3000 },
      );
      const m = out.match(/CommandLine=(.+)/i);
      return (m?.[1] ?? "").trim().slice(0, 240);
    }
    const out = execFileSync("ps", ["-p", String(pid), "-o", "command="], {
      encoding: "utf8",
      timeout: 3000,
    });
    return out.trim().slice(0, 240);
  } catch {
    return "";
  }
}

function signalPid(pid: number, signal: NodeJS.Signals): void {
  try {
    process.kill(pid, signal);
  } catch {
    /* already dead or permission */
  }
}

/**
 * Free `port` so Desktop can start the bundled Atmos Server with static UI.
 * Used when a leftover /healthz process does not serve the product HTML (e.g.
 * `target/debug/api` from just dev-api without ATMOS_STATIC_DIR).
 */
export async function reclaimPortWithoutDesktopUi(
  host: string,
  port: number,
  probe: Extract<UiProbeResult, { ok: false }>,
): Promise<{ killed: number[]; waitedMs: number }> {
  const pids = listPidsListeningOnPort(port);
  const cmds = pids.map((pid) => `${pid}: ${processCommandLine(pid) || "?"}`);
  ensureLog(
    `port ${port} has API without desktop UI (${probe.reason}); reclaiming listeners=[${cmds.join("; ")}]`,
  );

  for (const pid of pids) {
    if (pid === process.pid) continue;
    signalPid(pid, "SIGTERM");
  }

  const started = Date.now();
  const deadline = started + 8_000;
  while (Date.now() < deadline) {
    if (!(await isHealthy(host, port))) {
      return { killed: pids, waitedMs: Date.now() - started };
    }
    await sleep(200);
  }

  // Still healthy — force kill.
  for (const pid of pids) {
    if (pid === process.pid) continue;
    signalPid(pid, "SIGKILL");
  }
  await sleep(300);
  if (await isHealthy(host, port)) {
    throw new Error(
      [
        `Could not free port ${port} for Atmos Desktop UI.`,
        `A process still answers /healthz but not the product page.`,
        formatPortOccupiedWithoutUi(host, port, probe),
        pids.length
          ? `Tried to stop PIDs: ${pids.join(", ")}`
          : "Could not resolve listener PIDs (try quitting other Atmos/dev-api processes).",
      ].join("\n"),
    );
  }
  return { killed: pids, waitedMs: Date.now() - started };
}

export async function isHealthy(
  host = DEFAULT_HOST,
  port = DEFAULT_PORT,
): Promise<boolean> {
  const url = `http://${host}:${port}/healthz`;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 800);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    return res.ok;
  } catch {
    return false;
  }
}

/** True when body looks like a real HTML document (not empty 404). */
export function looksLikeAtmosUiHtml(body: string): boolean {
  return /<!doctype html|<html[\s>]/i.test(body);
}

export type UiProbeResult =
  | { ok: true; status: number; contentType: string; sample: string }
  | {
      ok: false;
      status: number | null;
      contentType: string;
      sample: string;
      reason: string;
    };

/**
 * Desktop UI is served by Atmos Server static files at `/`.
 * A bare dev `api` may pass /healthz but return 404 on `/` — do not reuse that.
 */
export async function probeDesktopUi(
  host = DEFAULT_HOST,
  port = DEFAULT_PORT,
): Promise<UiProbeResult> {
  const url = `http://${host}:${port}/`;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1500);
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: { Accept: "text/html,*/*" },
    });
    clearTimeout(timer);
    const contentType = res.headers.get("content-type") ?? "";
    const raw = await res.text();
    const sample = raw.slice(0, 240).replace(/\s+/g, " ").trim();
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        contentType,
        sample,
        reason: `GET ${url} returned HTTP ${res.status}`,
      };
    }
    if (!looksLikeAtmosUiHtml(raw)) {
      return {
        ok: false,
        status: res.status,
        contentType,
        sample,
        reason: `GET ${url} is not HTML (content-type=${contentType || "none"})`,
      };
    }
    return { ok: true, status: res.status, contentType, sample };
  } catch (e) {
    return {
      ok: false,
      status: null,
      contentType: "",
      sample: "",
      reason: `GET ${url} failed: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

export async function isUiServed(
  host = DEFAULT_HOST,
  port = DEFAULT_PORT,
): Promise<boolean> {
  return (await probeDesktopUi(host, port)).ok;
}

function formatPortOccupiedWithoutUi(
  host: string,
  port: number,
  probe: Extract<UiProbeResult, { ok: false }>,
): string {
  return [
    `Port ${port} has a healthy API (/healthz OK) but is not serving the Atmos desktop UI.`,
    `Desktop needs static files at http://${host}:${port}/ — usually from the bundled Atmos Server.`,
    ``,
    `Typical cause: a local dev process (e.g. target/debug/api or just dev-api) is bound to ${port}.`,
    `Stop that process, free the port, then reopen Atmos.`,
    ``,
    `Diagnostics:`,
    `  healthz: http://${host}:${port}/healthz → OK`,
    `  ui:      ${probe.reason}`,
    probe.status != null ? `  status:  ${probe.status}` : null,
    probe.contentType ? `  type:    ${probe.contentType}` : null,
    probe.sample ? `  body:    ${probe.sample}` : `  body:    (empty)`,
  ]
    .filter((line): line is string => line != null)
    .join("\n");
}

function writeManifest(host: string, port: number, pid: number | null) {
  const path = manifestPath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(
    path,
    `${JSON.stringify(
      {
        version: 1,
        source: "desktop-electron",
        pid,
        api: { host, port, url: `http://${host}:${port}` },
        updated_at: new Date().toISOString(),
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
}

export type EnsureResult = {
  host: string;
  port: number;
  runtimeDir: string;
  webDir: string;
  started: boolean;
  /** PID when this process started the Server (for quit-time stop). */
  pid: number | null;
};

/** PID of Server started by this Electron process; null if reused existing. */
let ownedServerPid: number | null = null;

export function getOwnedServerPid(): number | null {
  return ownedServerPid;
}

/**
 * Stop the Atmos Server only when this Electron process started it.
 * Safe no-op when Server was reused (another owner) or already gone.
 */
export function stopOwnedAtmosServer(): {
  stopped: boolean;
  pid: number | null;
  reason: string;
} {
  const pid = ownedServerPid;
  if (pid == null) {
    return { stopped: false, pid: null, reason: "not_owned" };
  }
  try {
    process.kill(pid, 0);
  } catch {
    ownedServerPid = null;
    return { stopped: false, pid, reason: "already_dead" };
  }
  try {
    process.kill(pid, "SIGTERM");
  } catch (e) {
    ownedServerPid = null;
    return {
      stopped: false,
      pid,
      reason: `sigterm_failed: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
  // Best-effort: if still alive shortly after, SIGKILL (sync sleep via spawn).
  try {
    execFileSync("sleep", ["0.4"], { stdio: "ignore" });
  } catch {
    /* ignore */
  }
  try {
    process.kill(pid, 0);
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      /* ignore */
    }
    ownedServerPid = null;
    return { stopped: true, pid, reason: "sigkill" };
  } catch {
    ownedServerPid = null;
    return { stopped: true, pid, reason: "sigterm" };
  }
}

/** Test helper */
export function setOwnedServerPidForTest(pid: number | null): void {
  ownedServerPid = pid;
}

export async function ensureAtmosServer(
  options: {
    host?: string;
    port?: number;
    runtimeDir?: string;
    healthAttempts?: number;
  } = {},
): Promise<EnsureResult> {
  const host = options.host ?? DEFAULT_HOST;
  const port =
    options.port ??
    (process.env.ATMOS_PORT
      ? parseInt(process.env.ATMOS_PORT, 10)
      : DEFAULT_PORT);
  const runtimeDir = options.runtimeDir ?? defaultRuntimeDir();
  const apiBin = apiBinaryPath(runtimeDir);
  const web = webDir(runtimeDir);
  const skills = systemSkillsDir(runtimeDir);

  if (!existsSync(apiBin)) {
    throw new Error(
      `Atmos Server binary missing at ${apiBin}. Run: bash ./scripts/desktop/prepare-sidecar.sh`,
    );
  }

  if (!existsSync(join(web, "index.html"))) {
    throw new Error(
      [
        `Desktop UI missing at ${join(web, "index.html")}.`,
        `Run: bash ./scripts/desktop/prepare-sidecar.sh`,
        `runtimeDir=${runtimeDir}`,
      ].join("\n"),
    );
  }

  if (await isHealthy(host, port)) {
    const ui = await probeDesktopUi(host, port);
    if (ui.ok) {
      // Reuse only when product HTML is actually served (bundled static / Next export).
      ownedServerPid = null;
      ensureLog(
        `reusing existing Atmos Server at http://${host}:${port} (UI OK)`,
      );
      return { host, port, runtimeDir, webDir: web, started: false, pid: null };
    }
    // e.g. leftover `just dev-api` / target/debug/api — healthz without static.
    // Desktop product must own the port with ATMOS_STATIC_DIR; reclaim then spawn.
    await reclaimPortWithoutDesktopUi(host, port, ui);
  }

  const logPath = runtimeLogPath();
  mkdirSync(dirname(logPath), { recursive: true });
  appendFileSync(
    logPath,
    `\n--- desktop-electron ensure ${new Date().toISOString()} ---\n`,
  );

  // Shared production data dir (not a shell-forked desktop-electron sandbox).
  const dataDir = resolveAtmosDataDir();
  mkdirSync(dataDir, { recursive: true });

  const pid = await spawnViaShell(
    apiBin,
    host,
    port,
    web,
    skills,
    dataDir,
    logPath,
    runtimeDir,
  );

  const attempts = options.healthAttempts ?? 80;
  for (let i = 0; i < attempts; i++) {
    if (await isHealthy(host, port)) {
      const ui = await probeDesktopUi(host, port);
      if (!ui.ok) {
        throw new Error(
          [
            `Atmos Server became healthy but still does not serve the desktop UI.`,
            `binary=${apiBin}`,
            `ATMOS_STATIC_DIR=${web}`,
            `log=${logPath}`,
            ``,
            formatPortOccupiedWithoutUi(host, port, ui),
          ].join("\n"),
        );
      }
      ownedServerPid = pid;
      writeManifest(host, port, pid);
      return { host, port, runtimeDir, webDir: web, started: true, pid };
    }
    await sleep(500);
  }

  throw new Error(
    [
      `Timed out waiting for Atmos Server at http://${host}:${port}.`,
      `binary=${apiBin}`,
      `webDir=${web}`,
      `log=${logPath}`,
    ].join("\n"),
  );
}

/**
 * Desktop shell-scoped Server data directory (`ATMOS_DATA_DIR`).
 *
 * Prefer env override; default `~/.atmos/data/desktop` (not desktop-electron).
 * Product feature stores (token-usage, quota-usage, SQLite, workspaces) must
 * **not** nest under this path — they use fixed `~/.atmos/data/<feature>` layouts.
 */
export function resolveAtmosDataDir(home: string = homedir()): string {
  if (process.env.ATMOS_DATA_DIR) return process.env.ATMOS_DATA_DIR;
  return join(home, ".atmos", "data", "desktop");
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** PATH for Atmos Server so Homebrew-installed tmux/gh/git remain discoverable. */
export function electronServerPath(envPath: string = process.env.PATH ?? ""): string {
  const home = process.env.HOME ?? homedir();
  const extras = [
    "/opt/homebrew/bin",
    "/opt/homebrew/sbin",
    "/usr/local/bin",
    "/usr/local/sbin",
    join(home, ".atmos", "bin"),
    join(home, ".local", "bin"),
    join(home, ".bun", "bin"),
    join(home, ".cargo", "bin"),
    join(home, ".grok", "bin"),
  ];
  const parts = [...extras, ...envPath.split(":").filter(Boolean)];
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const part of parts) {
    if (!part || seen.has(part)) continue;
    seen.add(part);
    deduped.push(part);
  }
  return deduped.join(":");
}

function spawnViaShell(
  apiBin: string,
  host: string,
  port: number,
  web: string,
  skills: string,
  dataDir: string,
  logPath: string,
  runtimeDir: string,
): Promise<number> {
  return new Promise((resolve, reject) => {
    // Always POSIX /bin/sh — process.env.SHELL may be fish/csh and break -c scripts.
    const shell = "/bin/sh";
    const child = spawn(
      shell,
      [
        "-c",
        'nohup "$ATMOS_LOCAL_API_BIN" --port "$ATMOS_LOCAL_PORT" --cleanup-stale-clients true </dev/null >>"$ATMOS_LOCAL_LOG_PATH" 2>&1 & echo $!',
      ],
      {
        env: {
          ...process.env,
          PATH: electronServerPath(),
          SERVER_HOST: host,
          ATMOS_PORT: String(port),
          ATMOS_STATIC_DIR: web,
          ATMOS_RUNTIME_DIR: runtimeDir,
          ATMOS_DATA_DIR: dataDir,
          ATMOS_LOCAL_API_BIN: apiBin,
          ATMOS_LOCAL_PORT: String(port),
          ATMOS_LOCAL_LOG_PATH: logPath,
          // Linear OAuth credentials are stored on Hub; default prod origin when unset.
          ATMOS_HUB_URL:
            process.env.ATMOS_HUB_URL?.trim() ||
            process.env.NEXT_PUBLIC_ATMOS_HUB_URL?.trim() ||
            "https://hub.atmos.land",
          ...(existsSync(skills) ? { ATMOS_SYSTEM_SKILLS_DIR: skills } : {}),
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );

    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (d) => {
      stdout += d.toString();
    });
    child.stderr?.on("data", (d) => {
      stderr += d.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0 && code !== null) {
        reject(
          new Error(
            stderr.trim() || `Atmos Server launcher shell exited ${code}`,
          ),
        );
        return;
      }
      const pid = parseInt(stdout.trim(), 10);
      if (!Number.isFinite(pid)) {
        reject(new Error(`Failed to parse Atmos Server pid: ${stdout}`));
        return;
      }
      resolve(pid);
    });
  });
}

export function appDataDir(): string {
  return resolveAtmosDataDir();
}

export function electronLogPath(): string {
  return join(atmosHome(), "logs", "desktop.log");
}

export function readManifestPort(): number | null {
  try {
    const raw = readFileSync(manifestPath(), "utf8");
    const m = JSON.parse(raw) as { api?: { port?: number } };
    return m.api?.port ?? null;
  } catch {
    return null;
  }
}
