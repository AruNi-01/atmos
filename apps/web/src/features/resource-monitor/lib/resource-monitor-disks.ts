import type { ResourceDiskMetrics } from "@atmos/api-types/ws/dto/resource-monitor";
import { RESOURCE_MONITOR_DISK_CAP } from "@/features/resource-monitor/lib/resource-monitor-constants";

export function diskDefaultOpen(): boolean {
  return false;
}

export function sortResourceMonitorDisks(
  disks: readonly ResourceDiskMetrics[],
): ResourceDiskMetrics[] {
  return disks
    .map((disk, index) => ({ disk, index }))
    .sort((left, right) => {
      if (right.disk.usage_percent !== left.disk.usage_percent) {
        return right.disk.usage_percent - left.disk.usage_percent;
      }
      return left.index - right.index;
    })
    .slice(0, RESOURCE_MONITOR_DISK_CAP)
    .map(({ disk }) => disk);
}

export function resourceMonitorDiskSummary(
  disks: readonly ResourceDiskMetrics[],
): ResourceDiskMetrics | null {
  return sortResourceMonitorDisks(disks)[0] ?? null;
}
