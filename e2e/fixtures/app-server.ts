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

const existingWebPort = process.env.E2E_BASE_URL ? null : (hasListeningPort(3030) ? 3030 : null);
const existingApiServer = hasListeningPort(readPort("E2E_API_PORT", 30303));

export const webPort = readPort("E2E_WEB_PORT", existingWebPort ?? 3330);
export const apiPort = readPort("E2E_API_PORT", 30303);
export const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${webPort}`;
export const shouldStartWebServer =
  process.env.E2E_START_WEB !== "0" && !process.env.E2E_BASE_URL;
export const shouldReuseWebServer =
  process.env.E2E_REUSE_SERVER === "1" || (existingWebPort != null && existingApiServer);

export function webServerCommand(): string {
  if (existingWebPort != null) {
    return `bash -lc 'api_pid=""; if ! lsof -iTCP:${apiPort} -sTCP:LISTEN >/dev/null 2>&1; then just dev-api --port ${apiPort} --web-port ${existingWebPort} >/tmp/atmos-e2e-api.log 2>&1 & api_pid=$!; until lsof -iTCP:${apiPort} -sTCP:LISTEN >/dev/null 2>&1; do sleep 1; done; fi; trap "if [ -n \\"$api_pid\\" ]; then kill $api_pid; fi" EXIT; while true; do sleep 3600; done'`;
  }

  return `bash -lc 'api_pid=""; if ! lsof -iTCP:${apiPort} -sTCP:LISTEN >/dev/null 2>&1; then just dev-api >/tmp/atmos-e2e-api.log 2>&1 & api_pid=$!; fi; trap "if [ -n \\"$api_pid\\" ]; then kill $api_pid; fi" EXIT; NEXT_PUBLIC_API_PORT=${apiPort} bun x next dev --turbopack --port ${webPort}'`;
}
