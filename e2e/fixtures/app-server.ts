import path from "node:path";
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

export const webPort = readPort("E2E_WEB_PORT", 3330);
export const apiPort = readPort("E2E_API_PORT", 30303);
export const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${webPort}`;
export const shouldStartWebServer =
  process.env.E2E_START_WEB !== "0" && !process.env.E2E_BASE_URL;
export const shouldReuseWebServer = process.env.E2E_REUSE_SERVER === "1";

export function webServerCommand(): string {
  return `NEXT_PUBLIC_API_PORT=${apiPort} bun x next dev --turbopack --port ${webPort}`;
}
