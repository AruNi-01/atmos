"use client";

import type { QueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/api/query/query-keys";
import type { ComputerQueryScope } from "@/api/query/query-scope";
import type {
  ResourceAttributionStatus,
  ResourceDiskMetrics,
  ResourceHostCpuCore,
  ResourceHostMemoryMetrics,
  ResourceHostMetrics,
  ResourceMemoryAccounting,
  ResourceMonitorSnapshot,
  ResourceProcessMetrics,
  ResourceUsage,
} from "@atmos/api-types/ws/dto/resource-monitor";
import { RESOURCE_MONITOR_DISK_CAP } from "@/features/resource-monitor/lib/resource-monitor-constants";

const PROCESS_ALLOWED_KEYS = new Set(["name", "usage", "ports"]);
const DISK_ALLOWED_KEYS = new Set([
  "name",
  "mount_point",
  "total_bytes",
  "used_bytes",
  "available_bytes",
  "usage_percent",
  "removable",
]);

function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isFiniteIntegerNonNegative(value: unknown): value is number {
  return isFiniteNonNegative(value) && Number.isInteger(value);
}

const MEMORY_ACCOUNTING: ReadonlySet<ResourceMemoryAccounting> = new Set([
  "btop_mach",
  "linux_memavailable",
  "windows_avail_phys",
  "fallback_total_minus_available",
]);

export function isResourceMemoryAccounting(
  value: unknown,
): value is ResourceMemoryAccounting {
  return (
    typeof value === "string" &&
    MEMORY_ACCOUNTING.has(value as ResourceMemoryAccounting)
  );
}

function isCpuPercent(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100;
}

function isHostCores(
  value: unknown,
  logicalCpuCount: number,
): value is ResourceHostCpuCore[] {
  if (!Array.isArray(value)) return false;
  if (value.length === 0) return true;
  if (value.length !== logicalCpuCount) return false;
  let previousIndex = Number.NEGATIVE_INFINITY;
  const seen = new Set<number>();
  for (const entry of value) {
    if (!entry || typeof entry !== "object") return false;
    const core = entry as Record<string, unknown>;
    if (!Number.isInteger(core.index) || (core.index as number) < 0) return false;
    const index = core.index as number;
    if (seen.has(index) || index <= previousIndex) return false;
    seen.add(index);
    previousIndex = index;
    if (!isCpuPercent(core.cpu_percent)) return false;
  }
  return true;
}

function isHostMemory(
  value: unknown,
  headlineUsed: number,
  headlineTotal: number,
): value is ResourceHostMemoryMetrics {
  if (!value || typeof value !== "object") return false;
  const memory = value as Record<string, unknown>;
  if (
    !isFiniteNonNegative(memory.total_bytes) ||
    !isFiniteNonNegative(memory.used_bytes) ||
    !isFiniteNonNegative(memory.available_bytes) ||
    !isFiniteNonNegative(memory.free_bytes) ||
    !isFiniteNonNegative(memory.swap_total_bytes) ||
    !isFiniteNonNegative(memory.swap_used_bytes) ||
    !isFiniteNonNegative(memory.swap_free_bytes) ||
    !isResourceMemoryAccounting(memory.accounting)
  ) {
    return false;
  }
  if (memory.cached_bytes !== null && !isFiniteNonNegative(memory.cached_bytes)) {
    return false;
  }
  if (memory.used_bytes !== headlineUsed || memory.total_bytes !== headlineTotal) {
    return false;
  }
  if (memory.used_bytes + memory.available_bytes !== memory.total_bytes) {
    return false;
  }
  if (memory.swap_used_bytes + memory.swap_free_bytes !== memory.swap_total_bytes) {
    return false;
  }
  return true;
}

export function isResourceHostMetrics(value: unknown): value is ResourceHostMetrics {
  if (!value || typeof value !== "object") return false;
  const host = value as Record<string, unknown>;
  if (
    !isFiniteNonNegative(host.cpu_percent) ||
    !isFiniteNonNegative(host.memory_used_bytes) ||
    !isFiniteNonNegative(host.memory_total_bytes) ||
    !isFiniteIntegerNonNegative(host.logical_cpu_count)
  ) {
    return false;
  }
  return (
    isHostCores(host.cores, host.logical_cpu_count) &&
    isHostMemory(host.memory, host.memory_used_bytes, host.memory_total_bytes)
  );
}

function isListeningPort(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 65535;
}

function isResourceUsage(value: unknown): value is ResourceUsage {
  if (!value || typeof value !== "object") return false;
  const usage = value as Record<string, unknown>;
  return (
    isFiniteNonNegative(usage.cpu_percent) &&
    isFiniteNonNegative(usage.memory_rss_bytes) &&
    isFiniteNonNegative(usage.process_count)
  );
}

export function isSafeProcessName(name: unknown): name is string {
  if (typeof name !== "string") return false;
  const trimmed = name.trim();
  if (trimmed.length === 0) return false;
  if (trimmed.includes("..")) return false;
  if (trimmed.includes("/") || trimmed.includes("\\")) return false;
  if (trimmed.startsWith("/")) return false;
  if (/^[A-Za-z]:[\\/]/.test(trimmed)) return false;
  if (trimmed.startsWith("\\\\")) return false;
  return true;
}

function isProcessMetrics(value: unknown): value is ResourceProcessMetrics {
  if (!value || typeof value !== "object") return false;
  const process = value as Record<string, unknown>;
  const keys = Object.keys(process);
  if (keys.length !== PROCESS_ALLOWED_KEYS.size) return false;
  if (keys.some((key) => !PROCESS_ALLOWED_KEYS.has(key))) return false;
  return (
    isSafeProcessName(process.name) &&
    isResourceUsage(process.usage) &&
    Array.isArray(process.ports) &&
    process.ports.every(isListeningPort)
  );
}

function isProcessList(value: unknown): value is ResourceProcessMetrics[] {
  return Array.isArray(value) && value.every(isProcessMetrics);
}

function isSessionMetrics(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const session = value as Record<string, unknown>;
  return (
    typeof session.session_id === "string" &&
    (session.name === null || typeof session.name === "string") &&
    typeof session.terminal_kind === "string" &&
    isResourceUsage(session.usage) &&
    isProcessList(session.processes)
  );
}

function isWorkspaceMetrics(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const workspace = value as Record<string, unknown>;
  return (
    typeof workspace.workspace_id === "string" &&
    typeof workspace.name === "string" &&
    isResourceUsage(workspace.usage) &&
    Array.isArray(workspace.sessions) &&
    workspace.sessions.every(isSessionMetrics) &&
    isResourceUsage(workspace.other_usage) &&
    isProcessList(workspace.other_processes)
  );
}

function isProjectMetrics(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const project = value as Record<string, unknown>;
  return (
    typeof project.project_id === "string" &&
    typeof project.name === "string" &&
    isResourceUsage(project.usage) &&
    isResourceUsage(project.direct_usage) &&
    Array.isArray(project.workspaces) &&
    project.workspaces.every(isWorkspaceMetrics) &&
    Array.isArray(project.sessions) &&
    project.sessions.every(isSessionMetrics) &&
    isResourceUsage(project.other_usage) &&
    isProcessList(project.other_processes)
  );
}


function isAttributionStatus(value: unknown): value is ResourceAttributionStatus {
  return value === "complete" || value === "partial" || value === "unsupported";
}

function isDiskName(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function isResourceDiskMetrics(value: unknown): value is ResourceDiskMetrics {
  if (!value || typeof value !== "object") return false;
  const disk = value as Record<string, unknown>;
  const keys = Object.keys(disk);
  if (keys.length !== DISK_ALLOWED_KEYS.size) return false;
  if (keys.some((key) => !DISK_ALLOWED_KEYS.has(key))) return false;
  if (!isDiskName(disk.name)) return false;
  if (typeof disk.mount_point !== "string" || disk.mount_point.length === 0) {
    return false;
  }
  if (
    !isFiniteNonNegative(disk.total_bytes) ||
    !isFiniteNonNegative(disk.used_bytes) ||
    !isFiniteNonNegative(disk.available_bytes) ||
    !isCpuPercent(disk.usage_percent) ||
    typeof disk.removable !== "boolean"
  ) {
    return false;
  }
  return disk.used_bytes + disk.available_bytes === disk.total_bytes;
}

function isDiskList(value: unknown): value is ResourceDiskMetrics[] {
  return (
    Array.isArray(value) &&
    value.length <= RESOURCE_MONITOR_DISK_CAP &&
    value.every(isResourceDiskMetrics)
  );
}

export function isResourceMonitorSnapshot(
  data: unknown,
): data is ResourceMonitorSnapshot {
  if (!data || typeof data !== "object") return false;
  const value = data as Record<string, unknown>;
  return (
    isFiniteNonNegative(value.collected_at_ms) &&
    isResourceHostMetrics(value.host) &&
    isDiskList(value.disks) &&
    isResourceUsage(value.server) &&
    isResourceUsage(value.shared_runtime) &&
    isResourceUsage(value.unattributed) &&
    Array.isArray(value.projects) &&
    value.projects.every(isProjectMetrics) &&
    isAttributionStatus(value.attribution_status)
  );
}

/** Authoritative push: replace the scoped snapshot. Never refetch on this event. */
export function applyResourceMonitorUpdated(
  client: QueryClient,
  scope: ComputerQueryScope,
  data: unknown,
): boolean {
  if (!isResourceMonitorSnapshot(data)) return false;
  client.setQueryData(queryKeys.computer.resourceMonitorSnapshot(scope), data);
  return true;
}
