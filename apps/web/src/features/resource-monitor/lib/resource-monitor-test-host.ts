import type {
  ResourceDiskMetrics,
  ResourceHostCpuCore,
  ResourceHostMemoryMetrics,
  ResourceHostMetrics,
  ResourceMemoryAccounting,
  ResourceMonitorSnapshot,
  ResourceUsage,
} from "@atmos/api-types/ws/dto/resource-monitor";

const EMPTY_USAGE: ResourceUsage = {
  cpu_percent: 0,
  memory_rss_bytes: 0,
  process_count: 0,
};

export function testHostMemory(
  overrides: Partial<ResourceHostMemoryMetrics> = {},
): ResourceHostMemoryMetrics {
  const total = overrides.total_bytes ?? 16_000_000_000;
  const used = overrides.used_bytes ?? 8_000_000_000;
  const swapTotal = overrides.swap_total_bytes ?? 4_000_000_000;
  const swapUsed = overrides.swap_used_bytes ?? 1_000_000_000;
  return {
    total_bytes: total,
    used_bytes: used,
    available_bytes: overrides.available_bytes ?? total - used,
    free_bytes: overrides.free_bytes ?? 1_000_000_000,
    cached_bytes: overrides.cached_bytes === undefined ? 500_000_000 : overrides.cached_bytes,
    swap_total_bytes: swapTotal,
    swap_used_bytes: swapUsed,
    swap_free_bytes: overrides.swap_free_bytes ?? swapTotal - swapUsed,
    accounting: overrides.accounting ?? "linux_memavailable",
  };
}

export function testHostCores(count: number, cpuPercent = 10): ResourceHostCpuCore[] {
  return Array.from({ length: count }, (_, index) => ({
    index,
    cpu_percent: cpuPercent,
  }));
}

export function testDiskMetrics(
  overrides: Partial<ResourceDiskMetrics> = {},
): ResourceDiskMetrics {
  const total = overrides.total_bytes ?? 1_000_000_000_000;
  const used = overrides.used_bytes ?? 400_000_000_000;
  return {
    name: overrides.name ?? "Macintosh HD",
    mount_point: overrides.mount_point ?? "/",
    total_bytes: total,
    used_bytes: used,
    available_bytes: overrides.available_bytes ?? total - used,
    usage_percent: overrides.usage_percent ?? 40,
    removable: overrides.removable ?? false,
  };
}

export function testHostMetrics(
  overrides: Partial<ResourceHostMetrics> = {},
): ResourceHostMetrics {
  const memory =
    overrides.memory ??
    testHostMemory({
      ...(overrides.memory_used_bytes != null
        ? { used_bytes: overrides.memory_used_bytes }
        : {}),
      ...(overrides.memory_total_bytes != null
        ? { total_bytes: overrides.memory_total_bytes }
        : {}),
    });
  const logical = overrides.logical_cpu_count ?? 8;
  return {
    cpu_percent: overrides.cpu_percent ?? 12,
    memory_used_bytes: overrides.memory_used_bytes ?? memory.used_bytes,
    memory_total_bytes: overrides.memory_total_bytes ?? memory.total_bytes,
    logical_cpu_count: logical,
    cores: overrides.cores ?? testHostCores(logical),
    memory: overrides.memory ?? memory,
  };
}

export function testSnapshot(
  overrides: Partial<ResourceMonitorSnapshot> = {},
): ResourceMonitorSnapshot {
  const usage: ResourceUsage = {
    cpu_percent: 1.5,
    memory_rss_bytes: 1024,
    process_count: 1,
  };
  return {
    collected_at_ms: 1_700_000_000,
    host: testHostMetrics(),
    disks: [],
    server: usage,
    shared_runtime: usage,
    desktop_use: EMPTY_USAGE,
    projects: [],
    unattributed: EMPTY_USAGE,
    attribution_status: "complete",
    ...overrides,
  };
}

export const TEST_ACCOUNTING: readonly ResourceMemoryAccounting[] = [
  "btop_mach",
  "linux_memavailable",
  "windows_avail_phys",
  "fallback_total_minus_available",
];
