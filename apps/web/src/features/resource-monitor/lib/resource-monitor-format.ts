import type { ResourceUsage } from "@atmos/api-types/ws/dto/resource-monitor";
import { RESOURCE_MONITOR_STALE_MS } from "@/features/resource-monitor/lib/resource-monitor-constants";

const MEMORY_UNITS = ["B", "KB", "MB", "GB", "TB"] as const;

export function formatPercent(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0%";
  const clamped = Math.min(100, Math.max(0, value));
  if (clamped < 10) return `${clamped.toFixed(1)}%`;
  return `${Math.round(clamped)}%`;
}

export function formatCpuPercent(value: number): string {
  return formatPercent(value);
}

export function formatMemoryBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  let amount = bytes;
  let unitIndex = 0;
  while (amount >= 1024 && unitIndex < MEMORY_UNITS.length - 1) {
    amount /= 1024;
    unitIndex += 1;
  }
  const whole = Math.abs(amount - Math.round(amount)) < 0.05;
  const digits = unitIndex === 0 || amount >= 10 || whole ? 0 : 1;
  return `${amount.toFixed(digits)} ${MEMORY_UNITS[unitIndex]}`;
}

export function formatMemoryPair(usedBytes: number, totalBytes: number): string {
  return `${formatMemoryBytes(usedBytes)} / ${formatMemoryBytes(totalBytes)}`;
}

export function sumAtmosUsage(
  server: ResourceUsage,
  shared: ResourceUsage,
): ResourceUsage {
  return {
    cpu_percent: server.cpu_percent + shared.cpu_percent,
    memory_rss_bytes: server.memory_rss_bytes + shared.memory_rss_bytes,
    process_count: server.process_count + shared.process_count,
  };
}

export function isUsageVisible(usage: ResourceUsage): boolean {
  return (
    usage.process_count > 0 ||
    usage.cpu_percent > 0 ||
    usage.memory_rss_bytes > 0
  );
}

export function processBasename(name: string): string {
  const trimmed = name.trim();
  const parts = trimmed.split(/[/\\]+/).filter(Boolean);
  return parts.at(-1) || trimmed;
}

export function formatProcessCountSuffix(count: number): string | null {
  if (!Number.isFinite(count) || count <= 1) return null;
  return `×${Math.round(count)}`;
}

export function normalizeProcessPorts(ports: readonly number[]): number[] {
  const unique = new Set<number>();
  for (const port of ports) {
    if (Number.isInteger(port) && port >= 0 && port <= 65535) {
      unique.add(port);
    }
  }
  return [...unique].sort((left, right) => left - right);
}

export function formatListeningPort(port: number): string {
  return `:${port}`;
}

/** Stale uses local receive time (`dataUpdatedAt`), never server `collected_at_ms`. */
export function isSnapshotStale(
  lastUpdatedAtMs: number,
  nowMs = Date.now(),
  thresholdMs = RESOURCE_MONITOR_STALE_MS,
): boolean {
  if (!Number.isFinite(lastUpdatedAtMs) || lastUpdatedAtMs <= 0) return false;
  return nowMs - lastUpdatedAtMs > thresholdMs;
}
