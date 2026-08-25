import type { ResourceUsage } from "@atmos/api-types/ws/dto/resource-monitor";
import { percentSlidingParts, type SlidingMetricParts } from "@workspace/ui";
import { RESOURCE_MONITOR_STALE_MS } from "@/features/resource-monitor/lib/resource-monitor-constants";

const MEMORY_UNITS = ["B", "KB", "MB", "GB", "TB"] as const;

export function formatPercent(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0%";
  const clamped = Math.min(100, Math.max(0, value));
  if (clamped < 10) return `${clamped.toFixed(1)}%`;
  return `${Math.round(clamped)}%`;
}

/** Per-core CPU: 100% = one full logical core and may exceed 100%. */
export function formatCpuPercent(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0%";
  const amount = Math.max(0, value);
  if (amount < 10) return `${amount.toFixed(1)}%`;
  return `${Math.round(amount)}%`;
}

/** Sliding-number parts matching {@link formatCpuPercent} decimals. */
export function cpuSlidingParts(
  value: number,
  locale = "en",
): SlidingMetricParts {
  const amount = Number.isFinite(value) && value > 0 ? value : 0;
  return percentSlidingParts(amount, locale, amount > 0 && amount < 10 ? 1 : 0);
}

/** Sliding-number parts matching {@link formatPercent} decimals. */
export function hostPercentSlidingParts(
  value: number,
  locale = "en",
): SlidingMetricParts {
  const amount =
    Number.isFinite(value) && value > 0 ? Math.min(100, Math.max(0, value)) : 0;
  return percentSlidingParts(amount, locale, amount > 0 && amount < 10 ? 1 : 0);
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
  desktopUse: ResourceUsage = {
    cpu_percent: 0,
    memory_rss_bytes: 0,
    process_count: 0,
  },
): ResourceUsage {
  return {
    cpu_percent: server.cpu_percent + shared.cpu_percent + desktopUse.cpu_percent,
    memory_rss_bytes:
      server.memory_rss_bytes + shared.memory_rss_bytes + desktopUse.memory_rss_bytes,
    process_count:
      server.process_count + shared.process_count + desktopUse.process_count,
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
