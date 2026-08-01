"use client";

import { useQuery } from "@tanstack/react-query";
import { useComputerQueryScope } from "@/api/query/query-scope";
import { useWebSocketStore } from "@/features/connection/hooks/use-websocket";
import {
  tokenUsageQueryOptions,
  type TokenUsageQueryFilters,
} from "@/features/quota-usage/lib/token-usage-query-options";

export function useTokenUsageQuery(
  filters?: TokenUsageQueryFilters,
  options?: { enabled?: boolean },
) {
  const scope = useComputerQueryScope();
  const connectionState = useWebSocketStore((s) => s.connectionState);

  return useQuery(
    tokenUsageQueryOptions(scope, connectionState, filters, {
      enabled: options?.enabled,
    }),
  );
}
