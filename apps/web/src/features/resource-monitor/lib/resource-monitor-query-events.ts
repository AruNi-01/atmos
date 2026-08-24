"use client";

import type { QueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/api/query/query-keys";
import type { ComputerQueryScope } from "@/api/query/query-scope";
import type {
  ResourceAttributionStatus,
  ResourceMonitorSnapshot,
  ResourceUsage,
} from "@atmos/api-types/ws/dto/resource-monitor";

function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
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

function isSessionMetrics(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const session = value as Record<string, unknown>;
  return (
    typeof session.session_id === "string" &&
    (session.name === null || typeof session.name === "string") &&
    typeof session.terminal_kind === "string" &&
    isResourceUsage(session.usage)
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
    workspace.sessions.every(isSessionMetrics)
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
    project.sessions.every(isSessionMetrics)
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
