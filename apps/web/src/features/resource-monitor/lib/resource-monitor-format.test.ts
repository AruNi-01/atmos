import { describe, expect, test } from "bun:test";
import {
  cpuSlidingParts,
  formatCpuPercent,
  formatListeningPort,
  formatMemoryBytes,
  formatMemoryPair,
  formatPercent,
  formatProcessCountSuffix,
  hostPercentSlidingParts,
  isSnapshotStale,
  isUsageVisible,
  memoryBytesSlidingParts,
  memoryPairSlidingParts,
  normalizeProcessPorts,
  processBasename,
  slidingPartsFromFormatted,
  sumAtmosUsage,
} from "@/features/resource-monitor/lib/resource-monitor-format";

describe("resource-monitor-format", () => {
  test("formats a generic 0–100 percent for memory and disks", () => {
    expect(formatPercent(3.42)).toBe("3.4%");
    expect(formatPercent(12.4)).toBe("12%");
    expect(formatPercent(0)).toBe("0%");
    expect(formatPercent(150)).toBe("100%");
  });

  test("cpu sliding parts keep formatCpuPercent decimals", () => {
    expect(cpuSlidingParts(3.42).decimals).toBe(1);
    expect(cpuSlidingParts(3.42).suffix).toBe("%");
    expect(cpuSlidingParts(12.4).decimals).toBe(0);
    expect(cpuSlidingParts(12.4).value).toBe(12);
    expect(cpuSlidingParts(150).value).toBe(150);
  });

  test("host percent sliding parts keep formatPercent decimals and clamp", () => {
    expect(hostPercentSlidingParts(3.42).decimals).toBe(1);
    expect(hostPercentSlidingParts(3.42).suffix).toBe("%");
    expect(hostPercentSlidingParts(12.4).decimals).toBe(0);
    expect(hostPercentSlidingParts(12.4).value).toBe(12);
    expect(hostPercentSlidingParts(150).value).toBe(100);
  });

  test("memory sliding parts match formatMemoryBytes units", () => {
    expect(memoryBytesSlidingParts(1536)).toEqual({
      value: 1.5,
      suffix: " KB",
      decimals: 1,
      decimalSeparator: ".",
    });
    expect(memoryBytesSlidingParts(8 * 1024 * 1024 * 1024)).toEqual({
      value: 8,
      suffix: " GB",
      decimals: 0,
      decimalSeparator: ".",
    });
  });

  test("memory pair sliding parts animate used and keep total as suffix", () => {
    expect(
      memoryPairSlidingParts(
        8 * 1024 * 1024 * 1024,
        16 * 1024 * 1024 * 1024,
      ),
    ).toEqual({
      value: 8,
      suffix: " GB / 16 GB",
      decimals: 0,
      decimalSeparator: ".",
    });
  });

  test("formatted sliding parts keep surrounding copy as prefix/suffix", () => {
    expect(
      slidingPartsFromFormatted("3.2 of 8 cores", 3.21, 1),
    ).toEqual({
      value: 3.2,
      suffix: " of 8 cores",
      decimals: 1,
      decimalSeparator: ".",
    });
    expect(slidingPartsFromFormatted("3.2 / 8 核", 3.2, 1).suffix).toBe(
      " / 8 核",
    );
  });

  test("formats per-core CPU past 100% with one decimal below 10%", () => {
    expect(formatCpuPercent(0)).toBe("0%");
    expect(formatCpuPercent(-1)).toBe("0%");
    expect(formatCpuPercent(3.42)).toBe("3.4%");
    expect(formatCpuPercent(12.4)).toBe("12%");
    expect(formatCpuPercent(100)).toBe("100%");
    expect(formatCpuPercent(150)).toBe("150%");
    expect(formatCpuPercent(1032.4)).toBe("1032%");
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

  test("sumAtmosUsage adds Server, shared, and Desktop Use", () => {
    expect(
      sumAtmosUsage(
        { cpu_percent: 2, memory_rss_bytes: 100, process_count: 1 },
        { cpu_percent: 3.5, memory_rss_bytes: 40, process_count: 2 },
        { cpu_percent: 0.2, memory_rss_bytes: 33, process_count: 1 },
      ),
    ).toEqual({ cpu_percent: 5.7, memory_rss_bytes: 173, process_count: 4 });
  });

  test("sumAtmosUsage includes Desktop shell total without double-counting groups", () => {
    expect(
      sumAtmosUsage(
        { cpu_percent: 1.8, memory_rss_bytes: 246, process_count: 1 },
        { cpu_percent: 0, memory_rss_bytes: 11, process_count: 1 },
        { cpu_percent: 0, memory_rss_bytes: 51, process_count: 1 },
        { cpu_percent: 67, memory_rss_bytes: 1100, process_count: 5 },
      ),
    ).toEqual({ cpu_percent: 68.8, memory_rss_bytes: 1408, process_count: 8 });
  });

  test("stale detection uses local receive time, not server collected_at", () => {
    expect(isSnapshotStale(1_000, 47_000)).toBe(true);
    expect(isSnapshotStale(1_000, 10_000)).toBe(false);
    expect(isSnapshotStale(0, 99_000)).toBe(false);
  });
});
