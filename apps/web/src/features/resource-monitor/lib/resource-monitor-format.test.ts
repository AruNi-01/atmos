import { describe, expect, test } from "bun:test";
import {
  formatCpuPercent,
  formatListeningPort,
  formatMemoryBytes,
  formatMemoryPair,
  formatPercent,
  formatProcessCountSuffix,
  isSnapshotStale,
  isUsageVisible,
  normalizeProcessPorts,
  processBasename,
  sumAtmosUsage,
} from "@/features/resource-monitor/lib/resource-monitor-format";

describe("resource-monitor-format", () => {
  test("formats a generic percent the same way as CPU", () => {
    expect(formatPercent(3.42)).toBe("3.4%");
    expect(formatPercent(12.4)).toBe("12%");
    expect(formatPercent(0)).toBe("0%");
  });

  test("formats CPU with one decimal below 10% and integers at or above", () => {
    expect(formatCpuPercent(0)).toBe("0%");
    expect(formatCpuPercent(-1)).toBe("0%");
    expect(formatCpuPercent(3.42)).toBe("3.4%");
    expect(formatCpuPercent(12.4)).toBe("12%");
    expect(formatCpuPercent(100)).toBe("100%");
    expect(formatCpuPercent(150)).toBe("100%");
    expect(formatCpuPercent(Number.POSITIVE_INFINITY)).toBe("0%");
    expect(formatCpuPercent(Number.NaN)).toBe("0%");
  });

  test("formats memory with 1024-based units", () => {
    expect(formatMemoryBytes(0)).toBe("0 B");
    expect(formatMemoryBytes(512)).toBe("512 B");
    expect(formatMemoryBytes(1536)).toBe("1.5 KB");
    expect(formatMemoryBytes(10 * 1024)).toBe("10 KB");
    expect(formatMemoryBytes(8 * 1024 * 1024 * 1024)).toBe("8 GB");
  });

  test("formats used/total memory as a pair", () => {
    expect(formatMemoryPair(8 * 1024 * 1024 * 1024, 16 * 1024 * 1024 * 1024)).toBe(
      "8 GB / 16 GB",
    );
  });

  test("usage visibility treats any non-zero field as visible", () => {
    expect(
      isUsageVisible({ cpu_percent: 0, memory_rss_bytes: 0, process_count: 0 }),
    ).toBe(false);
    expect(
      isUsageVisible({ cpu_percent: 0.1, memory_rss_bytes: 0, process_count: 0 }),
    ).toBe(true);
    expect(
      isUsageVisible({ cpu_percent: 0, memory_rss_bytes: 12, process_count: 0 }),
    ).toBe(true);
    expect(
      isUsageVisible({ cpu_percent: 0, memory_rss_bytes: 0, process_count: 1 }),
    ).toBe(true);
  });

  test("process display uses basename, count suffix, and compact ports", () => {
    expect(processBasename("/usr/local/bin/node")).toBe("node");
    expect(processBasename("C:\\\\Program Files\\\\node.exe")).toBe("node.exe");
    expect(processBasename("  vite  ")).toBe("vite");
    expect(formatProcessCountSuffix(1)).toBeNull();
    expect(formatProcessCountSuffix(3)).toBe("×3");
    expect(formatListeningPort(3030)).toBe(":3030");
    expect(normalizeProcessPorts([4173, 3000, 3000, 65536, -1, 80])).toEqual([
      80, 3000, 4173,
    ]);
  });

  test("sumAtmosUsage adds Server and shared only", () => {
    expect(
      sumAtmosUsage(
        { cpu_percent: 2, memory_rss_bytes: 100, process_count: 1 },
        { cpu_percent: 3.5, memory_rss_bytes: 40, process_count: 2 },
      ),
    ).toEqual({ cpu_percent: 5.5, memory_rss_bytes: 140, process_count: 3 });
  });

  test("stale detection uses local receive time, not server collected_at", () => {
    expect(isSnapshotStale(1_000, 47_000)).toBe(true);
    expect(isSnapshotStale(1_000, 10_000)).toBe(false);
    expect(isSnapshotStale(0, 99_000)).toBe(false);
  });
});
