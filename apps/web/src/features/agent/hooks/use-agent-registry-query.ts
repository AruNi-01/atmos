"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useComputerQueryScope, getComputerQueryScope } from "@/api/query/query-scope";
import { useWebSocketStore } from "@/features/connection/hooks/use-websocket";
import { queryKeys } from "@/api/query/query-keys";
import {
  agentRegistryListQueryOptions,
  customAgentListQueryOptions,
  nativeChatAgentListQueryOptions,
} from "@/features/agent/lib/agent-registry-query-options";
import { agentApi } from "@/api/ws/agent-api";
import { getAtmosWebQueryClient } from "@/providers/app/query-client";

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

export function useNativeChatAgentListQuery() {
  const scope = useComputerQueryScope();
  const connectionState = useWebSocketStore((s) => s.connectionState);

  return useQuery(nativeChatAgentListQueryOptions(scope, connectionState));
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
    void queryClient.invalidateQueries({
      queryKey: queryKeys.computer.nativeChatAgentList(scope),
      refetchType: "active",
    });
  };
}

/**
 * Force a backend registry re-scan (force_refresh=true) into the shared cache.
 * Plain invalidateQueries only reuses agent_registry_list without force_refresh.
 */
export async function forceRefreshAgentRegistry(): Promise<void> {
  const client = getAtmosWebQueryClient();
  const scope = getComputerQueryScope();
  const [registry, custom, natives] = await Promise.all([
    agentApi.listRegistry(true),
    agentApi.listCustomAgents(),
    agentApi.listNativeChatAgents(),
  ]);
  client.setQueryData(queryKeys.computer.agentRegistryList(scope), registry);
  client.setQueryData(queryKeys.computer.customAgentList(scope), custom);
  client.setQueryData(queryKeys.computer.nativeChatAgentList(scope), natives);
}
