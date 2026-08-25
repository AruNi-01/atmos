"use client";

import type { QueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/api/query/query-keys";
import type { ComputerQueryScope } from "@/api/query/query-scope";
import type {
  ResourceAttributionStatus,
  ResourceMonitorSnapshot,
  ResourceProcessMetrics,
  ResourceUsage,
} from "@atmos/api-types/ws/dto/resource-monitor";

const PROCESS_ALLOWED_KEYS = new Set(["name", "usage", "ports"]);

function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
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

function isHostMetrics(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const host = value as Record<string, unknown>;
  return (
    isFiniteNonNegative(host.cpu_percent) &&
    isFiniteNonNegative(host.memory_used_bytes) &&
    isFiniteNonNegative(host.memory_total_bytes) &&
    isFiniteNonNegative(host.logical_cpu_count)
  );
}

function isAttributionStatus(value: unknown): value is ResourceAttributionStatus {
  return value === "complete" || value === "partial" || value === "unsupported";
}

export function isResourceMonitorSnapshot(
  data: unknown,
): data is ResourceMonitorSnapshot {
  if (!data || typeof data !== "object") return false;
  const value = data as Record<string, unknown>;
  return (
    isFiniteNonNegative(value.collected_at_ms) &&
    isHostMetrics(value.host) &&
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
