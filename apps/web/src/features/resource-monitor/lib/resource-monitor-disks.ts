import type { ResourceDiskMetrics } from "@atmos/api-types/ws/dto/resource-monitor";

export function diskDefaultOpen(): boolean {
  return false;
}

/** Backend emits at most one disk. Empty → null; otherwise the first row. */
export function resourceMonitorDiskSummary(
  disks: readonly ResourceDiskMetrics[],
): ResourceDiskMetrics | null {
  return disks[0] ?? null;
}
