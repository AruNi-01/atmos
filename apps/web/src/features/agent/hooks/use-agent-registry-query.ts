"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useComputerQueryScope } from "@/api/query/query-scope";
import { useWebSocketStore } from "@/features/connection/hooks/use-websocket";
import { queryKeys } from "@/api/query/query-keys";
import {
  agentRegistryListQueryOptions,
  customAgentListQueryOptions,
} from "@/features/agent/lib/agent-registry-query-options";

export function useAgentRegistryListQuery() {
  const scope = useComputerQueryScope();
  const connectionState = useWebSocketStore((s) => s.connectionState);

  return useQuery(agentRegistryListQueryOptions(scope, connectionState));
}

export function useCustomAgentListQuery() {
  const scope = useComputerQueryScope();
  const connectionState = useWebSocketStore((s) => s.connectionState);

  return useQuery(customAgentListQueryOptions(scope, connectionState));
}

/** Imperatively invalidate agent registry lists after install/remove mutations. */
export function useInvalidateAgentRegistry() {
  const queryClient = useQueryClient();
  const scope = useComputerQueryScope();

  return () => {
    void queryClient.invalidateQueries({
      queryKey: queryKeys.computer.agentRegistryList(scope),
      refetchType: "active",
    });
    void queryClient.invalidateQueries({
      queryKey: queryKeys.computer.customAgentList(scope),
      refetchType: "active",
    });
  };
}
