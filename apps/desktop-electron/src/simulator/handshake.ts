import type { HelperStateRecord } from "./types.ts";

export function helperStateRecordPath(
  simulatorId: string,
  tmpdir: string,
): string {
  return `${tmpdir.replace(/\/+$/, "")}/serve-sim/server-${simulatorId}.json`;
}

export function helperStateLogPath(simulatorId: string, tmpdir: string): string {
  return `${tmpdir.replace(/\/+$/, "")}/serve-sim/server-${simulatorId}.log`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function num(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/**
 * Derive stream-settings the way upstream does: replace the last path segment
 * of the published streamUrl. Do not hardcode endpoint paths.
 */
export function deriveStreamSettingsUrl(streamUrl: string): string {
  const url = new URL(streamUrl);
  const parts = url.pathname.split("/").filter((p) => p.length > 0);
  if (parts.length === 0) {
    url.pathname = "/stream-settings";
  } else {
    parts[parts.length - 1] = "stream-settings";
    url.pathname = `/${parts.join("/")}`;
  }
  return url.toString();
}

export function parseHelperStateRecord(raw: string): HelperStateRecord {
  const parsed = JSON.parse(raw) as unknown;
  const row = asRecord(parsed);
  if (!row) throw new Error("helper state record is not an object");
  const streamUrl = str(row.streamUrl);
  const wsUrl = str(row.wsUrl);
  const url = str(row.url);
  const port = num(row.port);
  const pid = num(row.pid);
  // Upstream JSON field name is `device` (helper-owned).
  const simulatorId = str(row["device"]);
  if (!streamUrl || !wsUrl || !url || !port || !pid || !simulatorId) {
    throw new Error("helper state record missing required fields");
  }
  const streamSettingsUrl = str(row.streamSettings) || deriveStreamSettingsUrl(streamUrl);
  return {
    pid,
    port,
    simulatorId,
    url,
    streamUrl,
    wsUrl,
    streamSettingsUrl,
  };
}

export function assertLoopbackUrl(url: string): void {
  const parsed = new URL(url);
  if (parsed.hostname !== "127.0.0.1" && parsed.hostname !== "localhost") {
    throw new Error("helper_bind_not_loopback");
  }
}

export function sessionProxyUrls(opts: {
  controlPort: number;
  token: string;
  wsPath: string;
  settingsPath: string;
}): { wsUrl: string; streamSettingsUrl: string } {
  const wsPath = opts.wsPath.startsWith("/") ? opts.wsPath : `/${opts.wsPath}`;
  const settingsPath = opts.settingsPath.startsWith("/")
    ? opts.settingsPath
    : `/${opts.settingsPath}`;
  return {
    wsUrl: `ws://127.0.0.1:${opts.controlPort}/s/${opts.token}${wsPath}`,
    streamSettingsUrl: `http://127.0.0.1:${opts.controlPort}/s/${opts.token}${settingsPath}`,
  };
}

/** Pids this spawn may signal on failure. Never SIGTERM a helper record for a different port. */
export function spawnFailurePids(opts: {
  childPid?: number;
  recordPid?: number;
  recordPort?: number;
  spawnPort: number;
}): number[] {
  const pids = new Set<number>();
  if (opts.childPid) pids.add(opts.childPid);
  if (opts.recordPid && opts.recordPort === opts.spawnPort) {
    pids.add(opts.recordPid);
  }
  return [...pids];
}

export function isOwnHelperRecord(
  record: { port: number },
  spawnPort: number,
): boolean {
  return record.port === spawnPort;
}
