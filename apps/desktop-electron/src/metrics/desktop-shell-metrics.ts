/**
 * Local Electron shell CPU/memory snapshot (APP-066).
 *
 * Pure collector: callers inject a ProcessMetric-like reader, logical CPU
 * count, and clock. Electron's first `percentCPUUsage` sample is 0; this
 * module never sleeps or re-samples to "prime" that counter.
 */

export type ResourceUsageView = {
  cpu_percent: number;
  memory_rss_bytes: number;
  process_count: number;
};

export type DesktopShellGroupKind =
  | "main"
  | "renderer"
  | "gpu"
  | "utility"
  | "other";

export type DesktopShellGroupMetrics = {
  kind: DesktopShellGroupKind;
  usage: ResourceUsageView;
};

export type DesktopShellMetricsSnapshot = {
  supported: boolean;
  collected_at_ms: number;
  logical_cpu_count: number;
  total: ResourceUsageView;
  groups: DesktopShellGroupMetrics[];
};

/** Structural subset of Electron's ProcessMetric — no Electron import required. */
export type ProcessMetricLike = {
  type?: unknown;
  memory?: { workingSetSize?: unknown } | null;
  cpu?: { percentCPUUsage?: unknown } | null;
  pid?: unknown;
  creationTime?: unknown;
  name?: unknown;
};

export type DesktopShellMetricsDeps = {
  readProcessMetrics: () => readonly ProcessMetricLike[];
  logicalCpuCount: number;
  nowMs?: () => number;
};

export const DESKTOP_SHELL_GROUP_KINDS = [
  "main",
  "renderer",
  "gpu",
  "utility",
  "other",
] as const satisfies readonly DesktopShellGroupKind[];

const EMPTY_USAGE: ResourceUsageView = {
  cpu_percent: 0,
  memory_rss_bytes: 0,
  process_count: 0,
};

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function nonNegativeFinite(value: unknown): number {
  const n = finiteNumber(value);
  return n != null && n > 0 ? n : 0;
}

function sanitizeLogicalCpuCount(value: unknown): number {
  const n = finiteNumber(value);
  if (n == null || n <= 0) return 0;
  return Math.trunc(n);
}

function mapProcessType(type: unknown): DesktopShellGroupKind {
  switch (type) {
    case "Browser":
      return "main";
    case "Tab":
      return "renderer";
    case "GPU":
      return "gpu";
    case "Utility":
      return "utility";
    default:
      return "other";
  }
}

function emptyGroups(): DesktopShellGroupMetrics[] {
  return DESKTOP_SHELL_GROUP_KINDS.map((kind) => ({
    kind,
    usage: { ...EMPTY_USAGE },
  }));
}

function unsupportedSnapshot(
  collectedAtMs: number,
  logicalCpuCount: number,
): DesktopShellMetricsSnapshot {
  return {
    supported: false,
    collected_at_ms: collectedAtMs,
    logical_cpu_count: logicalCpuCount,
    total: { ...EMPTY_USAGE },
    groups: emptyGroups(),
  };
}

function normalizeCpu(rawPercent: number, logicalCpuCount: number): number {
  if (logicalCpuCount <= 0) return 0;
  return rawPercent / logicalCpuCount;
}

export function collectDesktopShellMetrics(
  deps: DesktopShellMetricsDeps,
): DesktopShellMetricsSnapshot {
  const nowMs = deps.nowMs ?? Date.now;
  const collectedAtMs = nowMs();
  const logicalCpuCount = sanitizeLogicalCpuCount(deps.logicalCpuCount);

  let metrics: unknown;
  try {
    metrics = deps.readProcessMetrics();
  } catch {
    return unsupportedSnapshot(collectedAtMs, logicalCpuCount);
  }

  if (!Array.isArray(metrics)) {
    return unsupportedSnapshot(collectedAtMs, logicalCpuCount);
  }

  const rawCpu = new Map<DesktopShellGroupKind, number>(
    DESKTOP_SHELL_GROUP_KINDS.map((kind) => [kind, 0]),
  );
  const memoryBytes = new Map<DesktopShellGroupKind, number>(
    DESKTOP_SHELL_GROUP_KINDS.map((kind) => [kind, 0]),
  );
  const processCount = new Map<DesktopShellGroupKind, number>(
    DESKTOP_SHELL_GROUP_KINDS.map((kind) => [kind, 0]),
  );

  for (const item of metrics) {
    if (!item || typeof item !== "object") continue;
    const metric = item as ProcessMetricLike;
    const kind = mapProcessType(metric.type);
    const workingSetKb = nonNegativeFinite(metric.memory?.workingSetSize);
    const cpu = nonNegativeFinite(metric.cpu?.percentCPUUsage);
    rawCpu.set(kind, (rawCpu.get(kind) ?? 0) + cpu);
    memoryBytes.set(
      kind,
      (memoryBytes.get(kind) ?? 0) + Math.round(workingSetKb * 1024),
    );
    processCount.set(kind, (processCount.get(kind) ?? 0) + 1);
  }

  let totalRawCpu = 0;
  let totalMemory = 0;
  let totalCount = 0;
  const groups: DesktopShellGroupMetrics[] = DESKTOP_SHELL_GROUP_KINDS.map(
    (kind) => {
      const cpu = rawCpu.get(kind) ?? 0;
      const memory = memoryBytes.get(kind) ?? 0;
      const count = processCount.get(kind) ?? 0;
      totalRawCpu += cpu;
      totalMemory += memory;
      totalCount += count;
      return {
        kind,
        usage: {
          cpu_percent: normalizeCpu(cpu, logicalCpuCount),
          memory_rss_bytes: memory,
          process_count: count,
        },
      };
    },
  );

  return {
    supported: true,
    collected_at_ms: collectedAtMs,
    logical_cpu_count: logicalCpuCount,
    total: {
      cpu_percent: normalizeCpu(totalRawCpu, logicalCpuCount),
      memory_rss_bytes: totalMemory,
      process_count: totalCount,
    },
    groups,
  };
}
