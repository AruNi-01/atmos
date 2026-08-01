"use client";

import type { QueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/api/query/query-keys";
import { wsQueryOptions } from "@/api/query/computer-query-options";
import type { ComputerQueryScope } from "@/api/query/query-scope";
import {
  tokenUsageApi,
  type TokenUsageOverviewResponse,
  type TokenUsageGroupBy,
} from "@/api/ws/token-usage-api";

export interface TokenUsageQueryFilters {
  year?: string | null;
  since?: string | null;
  until?: string | null;
  clients?: string[] | null;
  groupBy?: TokenUsageGroupBy | null;
}

export function tokenUsageQueryOptions(
  scope: ComputerQueryScope,
  connectionState: "connecting" | "connected" | "disconnected" | "reconnecting",
  filters?: TokenUsageQueryFilters,
  options?: { enabled?: boolean },
) {
  return wsQueryOptions({
    scope,
    connectionState,
    enabled: options?.enabled,
    queryKey: queryKeys.computer.tokenUsageOverview(scope, {
      year: filters?.year ?? null,
      since: filters?.since ?? null,
      until: filters?.until ?? null,
      clients: filters?.clients ?? null,
      groupBy: filters?.groupBy ?? null,
    }),
    queryFn: () =>
      tokenUsageApi.getOverview({
        year: filters?.year ?? null,
        since: filters?.since ?? null,
        until: filters?.until ?? null,
        clients: filters?.clients ?? null,
        groupBy: filters?.groupBy ?? undefined,
      }),
    staleTime: 60_000,
  });
}

/** Invalidate all token usage queries after a `token_usage_updated` event. */
export function invalidateTokenUsageQueries(
  client: QueryClient,
  scope: ComputerQueryScope,
): void {
  void client.invalidateQueries({
    queryKey: [...queryKeys.computer.root(scope), "tokenUsage"],
    refetchType: "active",
  });
}
