"use client";

import { queryKeys } from "@/api/query/query-keys";
import { wsQueryOptions } from "@/api/query/computer-query-options";
import type { ComputerQueryScope } from "@/api/query/query-scope";
import {
  agentApi,
  type RegistryAgent,
  type CustomAgent,
  type NativeChatAgent,
} from "@/api/ws/agent-api";

type ConnectionState = "connecting" | "connected" | "disconnected" | "reconnecting";

export interface AgentRegistryListResponse {
  agents: RegistryAgent[];
}

export interface CustomAgentListResponse {
  agents: CustomAgent[];
}

export interface NativeChatAgentListResponse {
  agents: NativeChatAgent[];
}

export function agentRegistryListQueryOptions(
  scope: ComputerQueryScope,
  connectionState: ConnectionState,
) {
  return wsQueryOptions({
    scope,
    connectionState,
    queryKey: queryKeys.computer.agentRegistryList(scope),
    queryFn: (): Promise<AgentRegistryListResponse> => agentApi.listRegistry(),
    staleTime: 60_000,
  });
}

export function customAgentListQueryOptions(
  scope: ComputerQueryScope,
  connectionState: ConnectionState,
) {
  return wsQueryOptions({
    scope,
    connectionState,
    queryKey: queryKeys.computer.customAgentList(scope),
    queryFn: (): Promise<CustomAgentListResponse> => agentApi.listCustomAgents(),
    staleTime: 30_000,
  });
}

export function nativeChatAgentListQueryOptions(
  scope: ComputerQueryScope,
  connectionState: ConnectionState,
) {
  return wsQueryOptions({
    scope,
    connectionState,
    queryKey: queryKeys.computer.nativeChatAgentList(scope),
    queryFn: (): Promise<NativeChatAgentListResponse> => agentApi.listNativeChatAgents(),
    staleTime: 30_000,
  });
}
