"use client";

import type { QueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/api/query/query-keys";
import type { ComputerQueryScope } from "@/api/query/query-scope";
import type { QuotaOverviewResponse } from "@/api/ws/quota-usage-api";

export function isQuotaOverviewResponse(data: unknown): data is QuotaOverviewResponse {
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
export function applyQuotaOverviewUpdated(
  client: QueryClient,
  scope: ComputerQueryScope,
  data: unknown,
): boolean {
  if (!isQuotaOverviewResponse(data)) return false;
  client.setQueryData(queryKeys.computer.quotaOverview(scope), data);
  return true;
}
