import { describe, expect, test } from "bun:test";
import type { ResourceDiskMetrics } from "@atmos/api-types/ws/dto/resource-monitor";
import { RESOURCE_MONITOR_DISK_CAP } from "@/features/resource-monitor/lib/resource-monitor-constants";
import {
  diskDefaultOpen,
  resourceMonitorDiskSummary,
  sortResourceMonitorDisks,
} from "@/features/resource-monitor/lib/resource-monitor-disks";
import { testDiskMetrics } from "@/features/resource-monitor/lib/resource-monitor-test-host";

describe("resource monitor disks", () => {
  test("defaults collapsed", () => {
    expect(diskDefaultOpen()).toBe(false);
  });

  test("sorts by usage_percent descending and keeps equal percents stable", () => {
    const disks: ResourceDiskMetrics[] = [
      testDiskMetrics({ name: "a", mount_point: "/a", usage_percent: 40 }),
      testDiskMetrics({ name: "b", mount_point: "/b", usage_percent: 90 }),
      testDiskMetrics({ name: "c", mount_point: "/c", usage_percent: 40 }),
      testDiskMetrics({ name: "d", mount_point: "/d", usage_percent: 70 }),
    ];
    expect(sortResourceMonitorDisks(disks).map((disk) => disk.name)).toEqual([
      "b",
      "d",
      "a",
      "c",
    ]);
  });

  test("caps at 16 and uses the fullest volume as the collapsed summary", () => {
    const disks = Array.from({ length: 18 }, (_, index) =>
      testDiskMetrics({
        name: `vol-${String(index).padStart(2, "0")}`,
        mount_point: `/mnt/${index}`,
        usage_percent: index,
      }),
    );
    const sorted = sortResourceMonitorDisks(disks);
    expect(sorted).toHaveLength(RESOURCE_MONITOR_DISK_CAP);
    expect(sorted[0]?.name).toBe("vol-17");
    expect(sorted.at(-1)?.name).toBe("vol-02");
    expect(resourceMonitorDiskSummary(disks)?.name).toBe("vol-17");
    expect(resourceMonitorDiskSummary([])).toBeNull();
  });
});
