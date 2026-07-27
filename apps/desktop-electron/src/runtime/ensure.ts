/**
 * Ensure / reuse shared Atmos Server from the Phase-0+ runtime layout
 * (apps/desktop/src-tauri/binaries/runtime/current — shared artifact location).
 */

import { spawn } from "node:child_process";
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
  return join(atmosHome(), "runtime_manifest.json");
}

function runtimeLogPath(): string {
  return join(atmosHome(), "logs", "runtime-server.log");
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
};

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

  if (await isHealthy(host, port)) {
    return { host, port, runtimeDir, webDir: web, started: false };
  }

  const logPath = runtimeLogPath();
  mkdirSync(dirname(logPath), { recursive: true });
  appendFileSync(
    logPath,
    `\n--- desktop-electron ensure ${new Date().toISOString()} ---\n`,
  );

  const dataDir =
    process.env.ATMOS_DATA_DIR || join(atmosHome(), "desktop-electron");
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
      writeManifest(host, port, pid);
      return { host, port, runtimeDir, webDir: web, started: true };
    }
    await sleep(500);
  }

  throw new Error(
    `Timed out waiting for Atmos Server at http://${host}:${port} (see ${logPath})`,
  );
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
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
    const shell = process.env.SHELL || "/bin/sh";
    const child = spawn(
      shell,
      [
        "-c",
        'nohup "$ATMOS_LOCAL_API_BIN" --port "$ATMOS_LOCAL_PORT" --cleanup-stale-clients true </dev/null >>"$ATMOS_LOCAL_LOG_PATH" 2>&1 & echo $!',
      ],
      {
        env: {
          ...process.env,
          SERVER_HOST: host,
          ATMOS_PORT: String(port),
          ATMOS_STATIC_DIR: web,
          ATMOS_RUNTIME_DIR: runtimeDir,
          ATMOS_DATA_DIR: dataDir,
          ATMOS_LOCAL_API_BIN: apiBin,
          ATMOS_LOCAL_PORT: String(port),
          ATMOS_LOCAL_LOG_PATH: logPath,
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
  return (
    process.env.ATMOS_DATA_DIR || join(atmosHome(), "desktop-electron")
  );
}

export function electronLogPath(): string {
  return join(atmosHome(), "logs", "desktop-electron.log");
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
