import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const e2eDir = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(e2eDir, "../..");
export const webAppDir = path.join(repoRoot, "apps/web");

function readPort(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer, got ${JSON.stringify(raw)}`);
  }
  return parsed;
}

function hasListeningPort(port: number): boolean {
  try {
    execSync(`lsof -iTCP:${port} -sTCP:LISTEN`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function hasWorkingFrontend(port: number): boolean {
  try {
    execSync(`curl -fsS --max-time 2 "http://127.0.0.1:${port}/en" > /dev/null`, {
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

function shellCommand(lines: string[]): string {
  const script = lines.join("\n");
  const escapedScript = script.replace(/'/g, `'\\''`);
  return `bash -lc '${escapedScript}'`;
}

export const apiPort = readPort("E2E_API_PORT", 30303);
export const singleServerMode = process.env.E2E_SINGLE_SERVER !== "0";
const configuredWebPort = readPort("E2E_WEB_PORT", 3030);
const existingApiServer = hasListeningPort(apiPort);
const existingApiHasFrontend = existingApiServer && hasWorkingFrontend(apiPort);
const useSingleServer = singleServerMode && (!existingApiServer || existingApiHasFrontend);
const preferredWebPort = useSingleServer ? apiPort : configuredWebPort;
const existingWebPort = process.env.E2E_BASE_URL
  ? null
  : hasListeningPort(preferredWebPort) && hasWorkingFrontend(preferredWebPort)
    ? preferredWebPort
    : null;

export const webPort = useSingleServer ? apiPort : configuredWebPort;
export const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${webPort}`;

export const shouldStartWebServer =
  process.env.E2E_START_WEB !== "0" && !process.env.E2E_BASE_URL;
export const shouldReuseWebServer =
  process.env.E2E_REUSE_SERVER === "1" ||
  (existingWebPort != null && (useSingleServer ? existingApiHasFrontend : true));

function staticExportCommands(): string[] {
  const outDir = path.join(repoRoot, "apps", "web", "out");
  if (process.env.E2E_SKIP_WEB_BUILD === "1") {
    return [];
  }

  return [
    `if [ ! -d "${outDir}" ] || [ ! -f "${outDir}/index.html" ] || [ ! -f "${outDir}/en/index.html" ]; then`,
    `  rm -rf "${outDir}"`,
    `  cd "${repoRoot}"`,
    `  BUILD_TARGET="local-web" NEXT_PUBLIC_BUILD_TARGET="local-web" NEXT_PUBLIC_API_PORT="${apiPort}" bun --filter web build`,
    `fi`,
  ];
}

function startApiCommands(correspondingWebPort: number, serveStatic: boolean): string[] {
  const outDir = path.join(repoRoot, "apps", "web", "out");
  const env = serveStatic ? `ATMOS_STATIC_DIR="${outDir}" NEXT_PUBLIC_API_PORT="${apiPort}" ` : "";

  return [
    "api_pid=",
    `api_log="/tmp/atmos-e2e-api.log"`,
    `if ! lsof -iTCP:${apiPort} -sTCP:LISTEN >/dev/null 2>&1; then`,
    `  rm -f "${'$'}api_log"`,
    `  ${env}just dev-api --port ${apiPort} --web-port ${correspondingWebPort} >"${'$'}api_log" 2>&1 & api_pid=$!`,
    `  for _ in {1..60}; do`,
    `    if lsof -iTCP:${apiPort} -sTCP:LISTEN >/dev/null 2>&1; then`,
    `      break`,
    `    fi`,
    `    if ! kill -0 "${'$'}api_pid" >/dev/null 2>&1; then`,
    `      cat "${'$'}api_log"`,
    `      exit 1`,
    `    fi`,
    `    sleep 1`,
    `  done`,
    `  if ! lsof -iTCP:${apiPort} -sTCP:LISTEN >/dev/null 2>&1; then`,
    `    cat "${'$'}api_log"`,
    `    exit 1`,
    `  fi`,
    `fi`,
    `if [ -n "${'$'}api_pid" ]; then`,
    `  trap 'if [ -n "$api_pid" ]; then kill "$api_pid" >/dev/null 2>&1 || true; fi' EXIT`,
    `fi`,
  ];
}

export function webServerCommand(): string {
  const correspondingWebPort = useSingleServer
    ? apiPort
    : existingWebPort ?? webPort;
  const startNextDev = !useSingleServer && existingWebPort == null;
  const lines = [
    ...(useSingleServer ? staticExportCommands() : []),
    ...startApiCommands(correspondingWebPort, useSingleServer),
  ];

  if (startNextDev) {
    lines.push(`cd "${webAppDir}"`);
    lines.push(`NEXT_PUBLIC_API_PORT="${apiPort}" bun ./node_modules/next/dist/bin/next dev --turbopack --port ${webPort}`);
    return shellCommand(lines);
  }

  lines.push(`while true; do`);
  lines.push(`  sleep 3600`);
  lines.push(`done`);
  return shellCommand(lines);
}
