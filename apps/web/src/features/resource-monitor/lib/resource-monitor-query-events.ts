"use client";

import type { QueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/api/query/query-keys";
import type { ComputerQueryScope } from "@/api/query/query-scope";
import type {
  ResourceAttributionStatus,
  ResourceMonitorSnapshot,
  ResourceUsage,
} from "@atmos/api-types/ws/dto/resource-monitor";

function isResourceUsage(value: unknown): value is ResourceUsage {
  if (!value || typeof value !== "object") return false;
  const usage = value as Record<string, unknown>;
  return (
    typeof usage.cpu_percent === "number" &&
    typeof usage.memory_rss_bytes === "number" &&
    typeof usage.process_count === "number"
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
  if (typeof value.collected_at_ms !== "number") return false;
  if (!value.host || typeof value.host !== "object") return false;
  const host = value.host as Record<string, unknown>;
  if (
    typeof host.cpu_percent !== "number" ||
    typeof host.memory_used_bytes !== "number" ||
    typeof host.memory_total_bytes !== "number" ||
    typeof host.logical_cpu_count !== "number"
  ) {
    return false;
  }
  return (
    isResourceUsage(value.server) &&
    isResourceUsage(value.shared_runtime) &&
    isResourceUsage(value.unattributed) &&
    Array.isArray(value.projects) &&
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
