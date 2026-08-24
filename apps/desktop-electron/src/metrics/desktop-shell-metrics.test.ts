import { describe, expect, it } from "bun:test";
import {
  collectDesktopShellMetrics,
  DESKTOP_SHELL_GROUP_KINDS,
  type DesktopShellGroupKind,
  type DesktopShellMetricsSnapshot,
  type ProcessMetricLike,
} from "./desktop-shell-metrics.ts";

function usageOf(
  snapshot: DesktopShellMetricsSnapshot,
  kind: DesktopShellGroupKind,
) {
  const group = snapshot.groups.find((item) => item.kind === kind);
  expect(group).toBeDefined();
  return group!.usage;
}

function collectKeys(value: unknown, keys = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) collectKeys(item, keys);
    return keys;
  }
  if (value && typeof value === "object") {
    for (const [key, nested] of Object.entries(value)) {
      keys.add(key);
      collectKeys(nested, keys);
    }
  }
  return keys;
}

describe("collectDesktopShellMetrics", () => {
  it("groups Electron types, converts KB to bytes, and normalizes CPU", () => {
    const snapshot = collectDesktopShellMetrics({
      logicalCpuCount: 8,
      nowMs: () => 1_700_000_000_123,
      readProcessMetrics: () => [
        {
          type: "Browser",
          pid: 11,
          creationTime: 100,
          name: "Atmos",
          memory: { workingSetSize: 100 },
          cpu: { percentCPUUsage: 80 },
        },
        {
          type: "Tab",
          pid: 22,
          memory: { workingSetSize: 250 },
          cpu: { percentCPUUsage: 40 },
        },
        {
          type: "GPU",
          pid: 33,
          memory: { workingSetSize: 50 },
          cpu: { percentCPUUsage: 16 },
        },
        {
          type: "Utility",
          pid: 44,
          memory: { workingSetSize: 25 },
          cpu: { percentCPUUsage: 8 },
        },
        {
          type: "Zygote",
          pid: 55,
          name: "sandbox helper",
          memory: { workingSetSize: 10 },
          cpu: { percentCPUUsage: 8 },
        },
      ],
    });

    expect(snapshot.supported).toBe(true);
    expect(snapshot.collected_at_ms).toBe(1_700_000_000_123);
    expect(snapshot.logical_cpu_count).toBe(8);
    expect(snapshot.groups.map((group) => group.kind)).toEqual([
      ...DESKTOP_SHELL_GROUP_KINDS,
    ]);

    expect(usageOf(snapshot, "main")).toEqual({
      cpu_percent: 10,
      memory_rss_bytes: 100 * 1024,
      process_count: 1,
    });
    expect(usageOf(snapshot, "renderer")).toEqual({
      cpu_percent: 5,
      memory_rss_bytes: 250 * 1024,
      process_count: 1,
    });
    expect(usageOf(snapshot, "gpu")).toEqual({
      cpu_percent: 2,
      memory_rss_bytes: 50 * 1024,
      process_count: 1,
    });
    expect(usageOf(snapshot, "utility")).toEqual({
      cpu_percent: 1,
      memory_rss_bytes: 25 * 1024,
      process_count: 1,
    });
    expect(usageOf(snapshot, "other")).toEqual({
      cpu_percent: 1,
      memory_rss_bytes: 10 * 1024,
      process_count: 1,
    });
    expect(snapshot.total).toEqual({
      cpu_percent: 19,
      memory_rss_bytes: (100 + 250 + 50 + 25 + 10) * 1024,
      process_count: 5,
    });
  });

  it("sums multiple processes in the same group", () => {
    const snapshot = collectDesktopShellMetrics({
      logicalCpuCount: 4,
      nowMs: () => 1,
      readProcessMetrics: () => [
        {
          type: "Tab",
          memory: { workingSetSize: 10 },
          cpu: { percentCPUUsage: 20 },
        },
        {
          type: "Tab",
          memory: { workingSetSize: 30 },
          cpu: { percentCPUUsage: 20 },
        },
      ],
    });

    expect(usageOf(snapshot, "renderer")).toEqual({
      cpu_percent: 10,
      memory_rss_bytes: 40 * 1024,
      process_count: 2,
    });
    expect(snapshot.total.process_count).toBe(2);
  });

  it("does not emit pid, creationTime, or process name", () => {
    const snapshot = collectDesktopShellMetrics({
      logicalCpuCount: 2,
      nowMs: () => 99,
      readProcessMetrics: () => [
        {
          type: "Browser",
          pid: 4242,
          creationTime: 88,
          name: "Atmos Main",
          serviceName: "browser",
          memory: { workingSetSize: 8 },
          cpu: { percentCPUUsage: 2 },
        } as ProcessMetricLike,
      ],
    });

    const keys = collectKeys(snapshot);
    expect(keys.has("pid")).toBe(false);
    expect(keys.has("creationTime")).toBe(false);
    expect(keys.has("name")).toBe(false);
    expect(keys.has("serviceName")).toBe(false);
    expect(JSON.stringify(snapshot)).not.toContain("Atmos Main");
    expect(JSON.stringify(snapshot)).not.toContain("4242");
  });

  it("keeps a first CPU sample of 0 and never re-reads to prime it", () => {
    let reads = 0;
    const snapshot = collectDesktopShellMetrics({
      logicalCpuCount: 8,
      nowMs: () => 5,
      readProcessMetrics: () => {
        reads += 1;
        return [
          {
            type: "Browser",
            memory: { workingSetSize: 12 },
            cpu: { percentCPUUsage: 0 },
          },
        ];
      },
    });

    expect(reads).toBe(1);
    expect(usageOf(snapshot, "main").cpu_percent).toBe(0);
    expect(snapshot.total.cpu_percent).toBe(0);
    expect(usageOf(snapshot, "main").memory_rss_bytes).toBe(12 * 1024);
  });

  it("treats missing and non-finite fields as zero without dropping the process", () => {
    const snapshot = collectDesktopShellMetrics({
      logicalCpuCount: 2,
      nowMs: () => 7,
      readProcessMetrics: () => [
        { type: "Browser" },
        {
          type: "Tab",
          memory: { workingSetSize: Number.NaN },
          cpu: { percentCPUUsage: Number.POSITIVE_INFINITY },
        },
        {
          type: "GPU",
          memory: { workingSetSize: -8 },
          cpu: { percentCPUUsage: Number.NaN },
        },
        null as unknown as ProcessMetricLike,
        "skip" as unknown as ProcessMetricLike,
      ],
    });

    expect(snapshot.supported).toBe(true);
    expect(usageOf(snapshot, "main")).toEqual({
      cpu_percent: 0,
      memory_rss_bytes: 0,
      process_count: 1,
    });
    expect(usageOf(snapshot, "renderer")).toEqual({
      cpu_percent: 0,
      memory_rss_bytes: 0,
      process_count: 1,
    });
    expect(usageOf(snapshot, "gpu")).toEqual({
      cpu_percent: 0,
      memory_rss_bytes: 0,
      process_count: 1,
    });
    expect(snapshot.total.process_count).toBe(3);
  });

  it("returns supported:false when the reader throws", () => {
    const snapshot = collectDesktopShellMetrics({
      logicalCpuCount: 8,
      nowMs: () => 42,
      readProcessMetrics: () => {
        throw new Error("app.getAppMetrics is unavailable");
      },
    });

    expect(snapshot).toEqual({
      supported: false,
      collected_at_ms: 42,
      logical_cpu_count: 8,
      total: { cpu_percent: 0, memory_rss_bytes: 0, process_count: 0 },
      groups: DESKTOP_SHELL_GROUP_KINDS.map((kind) => ({
        kind,
        usage: { cpu_percent: 0, memory_rss_bytes: 0, process_count: 0 },
      })),
    });
  });

  it("returns supported:false when the reader does not return an array", () => {
    const snapshot = collectDesktopShellMetrics({
      logicalCpuCount: 4,
      nowMs: () => 3,
      readProcessMetrics: () => ({}) as unknown as ProcessMetricLike[],
    });

    expect(snapshot.supported).toBe(false);
    expect(snapshot.total.process_count).toBe(0);
    expect(snapshot.logical_cpu_count).toBe(4);
  });

  it("sanitizes a non-finite logical CPU count and still reports memory", () => {
    const snapshot = collectDesktopShellMetrics({
      logicalCpuCount: Number.NaN,
      nowMs: () => 9,
      readProcessMetrics: () => [
        {
          type: "Browser",
          memory: { workingSetSize: 4 },
          cpu: { percentCPUUsage: 50 },
        },
      ],
    });

    expect(snapshot.supported).toBe(true);
    expect(snapshot.logical_cpu_count).toBe(0);
    expect(snapshot.total.cpu_percent).toBe(0);
    expect(snapshot.total.memory_rss_bytes).toBe(4 * 1024);
    expect(snapshot.total.process_count).toBe(1);
  });
});
