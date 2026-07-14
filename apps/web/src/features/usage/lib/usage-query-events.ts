"use client";

import type { QueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/api/query/query-keys";
import type { ComputerQueryScope } from "@/api/query/query-scope";
import type { UsageOverviewResponse } from "@/api/ws/usage-api";

export function isUsageOverviewResponse(data: unknown): data is UsageOverviewResponse {
  if (!data || typeof data !== "object") return false;
  const value = data as Record<string, unknown>;
  return (
    typeof value.generated_at === "number" &&
    Array.isArray(value.providers) &&
    value.all !== null &&
    typeof value.all === "object" &&
    Array.isArray(value.partial_failures) &&
    value.auto_refresh !== null &&
    typeof value.auto_refresh === "object"
  );
}

/** Authoritative push: replace the default usage overview snapshot. */
export function applyUsageOverviewUpdated(
  client: QueryClient,
  scope: ComputerQueryScope,
  data: unknown,
): boolean {
  if (!isUsageOverviewResponse(data)) return false;
  client.setQueryData(queryKeys.computer.usageOverview(scope), data);
  return true;
}
