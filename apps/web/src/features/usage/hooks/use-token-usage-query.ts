"use client";

import { useQuery } from "@tanstack/react-query";
import { useComputerQueryScope } from "@/api/query/query-scope";
import { useWebSocketStore } from "@/features/connection/hooks/use-websocket";
import {
  tokenUsageQueryOptions,
  type TokenUsageQueryFilters,
} from "@/features/usage/lib/token-usage-query-options";

export function useTokenUsageQuery(filters?: TokenUsageQueryFilters) {
  const scope = useComputerQueryScope();
  const connectionState = useWebSocketStore((s) => s.connectionState);

  return useQuery(tokenUsageQueryOptions(scope, connectionState, filters));
}
