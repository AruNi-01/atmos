"use client";

import type { QueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/api/query/query-keys";
import { wsQueryOptions } from "@/api/query/computer-query-options";
import type { ComputerQueryScope } from "@/api/query/query-scope";
import { wsRequest } from "@/api/ws/request";
import type {
  AutomationAgentCapabilitiesResponse,
  AutomationListResponse,
  AutomationRunListResponse,
} from "@/features/automations/types";

type ConnectionState = "connecting" | "connected" | "disconnected" | "reconnecting";

export function automationListQueryOptions(
  scope: ComputerQueryScope,
  connectionState: ConnectionState,
) {
  return wsQueryOptions({
    scope,
    connectionState,
    queryKey: queryKeys.computer.automationList(scope),
    queryFn: (): Promise<AutomationListResponse> =>
      wsRequest<AutomationListResponse>("automation_list", { include_paused: true }),
    staleTime: 30_000,
  });
}

export function automationAgentCapabilitiesQueryOptions(
  scope: ComputerQueryScope,
  connectionState: ConnectionState,
) {
  return wsQueryOptions({
    scope,
    connectionState,
    queryKey: queryKeys.computer.automationAgentCapabilities(scope),
    queryFn: (): Promise<AutomationAgentCapabilitiesResponse> =>
      wsRequest<AutomationAgentCapabilitiesResponse>("automation_agent_capabilities"),
    staleTime: 60_000,
  });
}

export function automationRunListQueryOptions(
  scope: ComputerQueryScope,
  connectionState: ConnectionState,
  automationGuid: string,
) {
  return wsQueryOptions({
    scope,
    connectionState,
    queryKey: queryKeys.computer.automationRunList(scope, automationGuid),
    queryFn: (): Promise<AutomationRunListResponse> =>
      wsRequest<AutomationRunListResponse>("automation_run_list", {
        automation_guid: automationGuid,
      }),
    staleTime: 15_000,
    enabled: Boolean(automationGuid),
  });
}

/** Invalidate the automation definition/list after automation_definition_updated. */
export function invalidateAutomationDefinitionQueries(
  client: QueryClient,
  scope: ComputerQueryScope,
): void {
  void client.invalidateQueries({
    queryKey: queryKeys.computer.automationList(scope),
    refetchType: "active",
  });
}

/** Invalidate all automation run lists after automation_run_updated. */
export function invalidateAutomationRunQueries(
  client: QueryClient,
  scope: ComputerQueryScope,
): void {
  void client.invalidateQueries({
    queryKey: [...queryKeys.computer.root(scope), "automations", "runs"],
    refetchType: "active",
  });
}
