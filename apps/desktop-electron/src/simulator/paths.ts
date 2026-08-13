import { homedir } from "node:os";
import { join } from "node:path";

export function atmosHomeDir(env: NodeJS.ProcessEnv = process.env): string {
  const override = env.ATMOS_HOME?.trim();
  if (override) return override;
  return join(homedir(), ".atmos");
}

export function simulatorStateDir(env: NodeJS.ProcessEnv = process.env): string {
  return join(atmosHomeDir(env), "state", "simulator");
}

export function controlJsonPath(env: NodeJS.ProcessEnv = process.env): string {
  return join(simulatorStateDir(env), "control.json");
}

export function claimsJsonPath(env: NodeJS.ProcessEnv = process.env): string {
  return join(simulatorStateDir(env), "claims.json");
}

export function lastUsedPath(
  workspaceId: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  return join(simulatorStateDir(env), "last-used", `${workspaceId}.json`);
}

export function auditLogPath(env: NodeJS.ProcessEnv = process.env): string {
  return join(simulatorStateDir(env), "audit.log");
}
