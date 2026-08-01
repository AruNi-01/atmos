"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { queryKeys } from "@/api/query/query-keys";
import { wsQueryOptions } from "@/api/query/computer-query-options";
import { useComputerQueryScope } from "@/api/query/query-scope";
import {
  quotaUsageApi,
  type QuotaOverviewResponse,
} from "@/api/ws/quota-usage-api";
import { useWebSocketStore } from "@/features/connection/hooks/use-websocket";

export function useQuotaOverviewQuery(options?: {
  enabled?: boolean;
  /**
   * Reserved for explicit refresh ops (`quotaUsageApi.getOverview(true, id)`).
   * Ignored here: server does not return a filtered snapshot for
   * refresh=false + provider_id, so reads always share the unfiltered key.
   */
  providerId?: string | null;
}) {
  const scope = useComputerQueryScope();
  const connectionState = useWebSocketStore((s) => s.connectionState);

  return useQuery(
    wsQueryOptions({
      scope,
      connectionState,
      queryKey: queryKeys.computer.quotaOverview(scope),
      queryFn: () => quotaUsageApi.getOverview(false),
      enabled: options?.enabled ?? true,
      staleTime: 60_000,
    }),
  );
}

/** Shared default overview key (no refresh / no provider filter). */
export function useQuotaOverviewCache() {
  const scope = useComputerQueryScope();
  const queryClient = useQueryClient();
  const key = queryKeys.computer.quotaOverview(scope);

  const setOverview = useCallback(
    (overview: QuotaOverviewResponse) => {
      queryClient.setQueryData(key, overview);
    },
    [queryClient, key],
  );

  const getOverview = useCallback((): QuotaOverviewResponse | undefined => {
    return queryClient.getQueryData<QuotaOverviewResponse>(key);
  }, [queryClient, key]);

  return { key, setOverview, getOverview, scope };
}

export type { QuotaOverviewResponse };
