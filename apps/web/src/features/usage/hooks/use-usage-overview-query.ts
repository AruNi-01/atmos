"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { queryKeys } from "@/api/query/query-keys";
import { wsQueryOptions } from "@/api/query/computer-query-options";
import { useComputerQueryScope } from "@/api/query/query-scope";
import {
  usageWsApi,
  type UsageOverviewResponse,
} from "@/api/ws/usage-api";
import { useWebSocketStore } from "@/features/connection/hooks/use-websocket";

export function useUsageOverviewQuery(options?: {
  enabled?: boolean;
  providerId?: string | null;
}) {
  const scope = useComputerQueryScope();
  const connectionState = useWebSocketStore((s) => s.connectionState);
  const providerId = options?.providerId ?? null;

  return useQuery(
    wsQueryOptions({
      scope,
      connectionState,
      queryKey: queryKeys.computer.usageOverview(scope, { providerId }),
      queryFn: () => usageWsApi.getOverview(false, providerId),
      enabled: options?.enabled ?? true,
      staleTime: 60_000,
    }),
  );
}

/** Shared default overview key (no refresh / no provider filter). */
export function useUsageOverviewCache() {
  const scope = useComputerQueryScope();
  const queryClient = useQueryClient();
  const key = queryKeys.computer.usageOverview(scope);

  const setOverview = useCallback(
    (overview: UsageOverviewResponse) => {
      queryClient.setQueryData(key, overview);
    },
    [queryClient, key],
  );

  const getOverview = useCallback((): UsageOverviewResponse | undefined => {
    return queryClient.getQueryData<UsageOverviewResponse>(key);
  }, [queryClient, key]);

  return { key, setOverview, getOverview, scope };
}

export type { UsageOverviewResponse };
