import { RESOURCE_MONITOR_HISTORY_CAP } from "@/features/resource-monitor/lib/resource-monitor-constants";

export type ResourceHostHistoryPoint = {
  received_at_ms: number;
  cpu_percent: number;
  memory_percent: number;
};

export type ResourceHostHistoryRing = {
  scopeKey: string;
  points: ResourceHostHistoryPoint[];
};

export type ResourceMonitorHistoryScope = {
  activeInstanceId: string;
  connectionEpoch: number;
  relaySessionRevision: number;
};

export function resourceMonitorHistoryScopeKey(
  scope: ResourceMonitorHistoryScope,
): string {
  return `${scope.activeInstanceId}:${scope.connectionEpoch}:${scope.relaySessionRevision}`;
}

export function emptyResourceHostHistoryRing(
  scopeKey = "",
): ResourceHostHistoryRing {
  return { scopeKey, points: [] };
}

/** Host used/total as 0–100. `total <= 0` is 0, never NaN. */
export function hostMemoryPercent(usedBytes: number, totalBytes: number): number {
  if (!Number.isFinite(usedBytes) || !Number.isFinite(totalBytes) || totalBytes <= 0) {
    return 0;
  }
  return clampPercent((usedBytes / totalBytes) * 100);
}

export function clampPercent(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.min(100, value);
}

export function resourceHostHistoryPointFromSnapshot(
  receivedAtMs: number,
  host: {
    cpu_percent: number;
    memory_used_bytes: number;
    memory_total_bytes: number;
  },
): ResourceHostHistoryPoint | null {
  if (!Number.isFinite(receivedAtMs) || receivedAtMs <= 0) return null;
  return {
    received_at_ms: receivedAtMs,
    cpu_percent: clampPercent(host.cpu_percent),
    memory_percent: hostMemoryPercent(host.memory_used_bytes, host.memory_total_bytes),
  };
}

/**
 * Append one Host point from an existing Query snapshot.
 * Resets when `scopeKey` changes. Dedupes the same local receive timestamp.
 */
export function appendResourceHostHistoryPoint(
  ring: ResourceHostHistoryRing,
  scopeKey: string,
  point: ResourceHostHistoryPoint | null,
  cap = RESOURCE_MONITOR_HISTORY_CAP,
): ResourceHostHistoryRing {
  if (ring.scopeKey !== scopeKey) {
    return {
      scopeKey,
      points: point ? [point] : [],
    };
  }
  if (!point) return ring;
  const last = ring.points[ring.points.length - 1];
  if (last && last.received_at_ms === point.received_at_ms) return ring;
  const next = [...ring.points, point];
  if (next.length <= cap) return { scopeKey, points: next };
  return { scopeKey, points: next.slice(next.length - cap) };
}
