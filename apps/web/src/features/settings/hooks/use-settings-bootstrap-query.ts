"use client";

import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/api/query/query-keys";
import { wsQueryOptions } from "@/api/query/computer-query-options";
import { useComputerQueryScope } from "@/api/query/query-scope";
import {
  settingsBootstrapQueryFn,
  type SettingsBootstrapPayload,
} from "@/api/ws/settings-bootstrap-cache";
import { useWebSocketStore } from "@/features/connection/hooks/use-websocket";

export function useSettingsBootstrapQuery(options?: { enabled?: boolean }) {
  const scope = useComputerQueryScope();
  const connectionState = useWebSocketStore((s) => s.connectionState);

  return useQuery(
    wsQueryOptions({
      scope,
      connectionState,
      queryKey: queryKeys.computer.settingsBootstrap(scope),
      queryFn: () => settingsBootstrapQueryFn(scope),
      enabled: options?.enabled ?? true,
    }),
  );
}

export function useFunctionSettingsQuery(options?: { enabled?: boolean }) {
  const query = useSettingsBootstrapQuery(options);
  return {
    ...query,
    data: query.data?.function_settings,
  };
}

export function useLlmProvidersQuery(options?: { enabled?: boolean }) {
  const query = useSettingsBootstrapQuery(options);
  return {
    ...query,
    data: query.data?.llm_providers,
  };
}

export function useCodeAgentCustomQuery(options?: { enabled?: boolean }) {
  const query = useSettingsBootstrapQuery(options);
  return {
    ...query,
    data: query.data?.code_agent_custom,
  };
}

export function useAgentBehaviourSettingsQuery(options?: { enabled?: boolean }) {
  const query = useSettingsBootstrapQuery(options);
  return {
    ...query,
    data: query.data?.agent_behaviour_settings,
  };
}

export type { SettingsBootstrapPayload };
