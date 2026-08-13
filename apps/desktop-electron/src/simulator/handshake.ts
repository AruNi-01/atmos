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
