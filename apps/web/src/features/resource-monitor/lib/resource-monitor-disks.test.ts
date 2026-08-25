import { describe, expect, test } from "bun:test";
import {
  diskDefaultOpen,
  resourceMonitorDiskSummary,
} from "@/features/resource-monitor/lib/resource-monitor-disks";
import { testDiskMetrics } from "@/features/resource-monitor/lib/resource-monitor-test-host";

describe("resource monitor disks", () => {
  test("defaults collapsed", () => {
    expect(diskDefaultOpen()).toBe(false);
  });

  test("summary is empty or the first disk", () => {
    expect(resourceMonitorDiskSummary([])).toBeNull();
    const only = testDiskMetrics({ name: "Macintosh HD", mount_point: "/" });
    expect(resourceMonitorDiskSummary([only])).toEqual(only);
    expect(
      resourceMonitorDiskSummary([
        only,
        testDiskMetrics({ name: "Data", mount_point: "/System/Volumes/Data" }),
      ]),
    ).toEqual(only);
  });
});
