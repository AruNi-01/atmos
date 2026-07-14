"use client";

import { useQuery } from "@tanstack/react-query";
import { useComputerQueryScope } from "@/api/query/query-scope";
import { useWebSocketStore } from "@/features/connection/hooks/use-websocket";
import {
  automationListQueryOptions,
  automationAgentCapabilitiesQueryOptions,
  automationRunListQueryOptions,
} from "@/features/automations/lib/automations-query-options";

export function useAutomationListQuery() {
  const scope = useComputerQueryScope();
  const connectionState = useWebSocketStore((s) => s.connectionState);

  return useQuery(automationListQueryOptions(scope, connectionState));
}

export function useAutomationAgentCapabilitiesQuery() {
  const scope = useComputerQueryScope();
  const connectionState = useWebSocketStore((s) => s.connectionState);

  return useQuery(automationAgentCapabilitiesQueryOptions(scope, connectionState));
}

export function useAutomationRunListQuery(automationGuid: string | null) {
  // Reserved for a future run-list cutover. Run history still uses imperative
  // `loadRuns` in use-automation-run-history-state (request-seq race control).
  // Bridge invalidates this key on run events so a Query consumer can adopt it later.
  const scope = useComputerQueryScope();
  const connectionState = useWebSocketStore((s) => s.connectionState);

  return useQuery(
    automationRunListQueryOptions(scope, connectionState, automationGuid ?? ""),
  );
}
