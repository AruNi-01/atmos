"use client";

import type { QueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/api/query/query-keys";
import type { ComputerQueryScope } from "@/api/query/query-scope";
import type { LocalServicesScanResponse } from "@/api/ws/local-services-api";
import { localServicesScopeKey } from "@/features/local-services/store/local-services-store";

export function isLocalServicesScanResponse(
  data: unknown,
): data is LocalServicesScanResponse {
  if (!data || typeof data !== "object") return false;
  const value = data as Record<string, unknown>;
  return (
    typeof value.scanned_at === "string" &&
    typeof value.cache_ttl_ms === "number" &&
    Array.isArray(value.services)
  );
}

/**
 * Authoritative push of the all-projects scan snapshot.
 * - setQueryData for `all_atmos_projects` (footer)
 * - invalidate other localServices scan keys (e.g. current_context preview)
 */
export function applyLocalServicesUpdated(
  client: QueryClient,
  scope: ComputerQueryScope,
  data: unknown,
): boolean {
  if (!isLocalServicesScanResponse(data)) return false;

  const allProjectsKey = queryKeys.computer.localServicesScan(
    scope,
    localServicesScopeKey({ scope: "all_atmos_projects" }),
  );
  client.setQueryData(allProjectsKey, data);

  void client.invalidateQueries({
    queryKey: [...queryKeys.computer.root(scope), "localServices", "scan"] as const,
    predicate: (query) => {
      const key = query.queryKey;
      if (key.length !== allProjectsKey.length) return true;
      return key.some((part, i) => part !== allProjectsKey[i]);
    },
    refetchType: "active",
  });

  return true;
}
