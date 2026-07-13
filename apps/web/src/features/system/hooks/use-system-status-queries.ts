"use client";

import { useQuery } from "@tanstack/react-query";
import { useComputerQueryScope } from "@/api/query/query-scope";
import { useComputerRuntimeReady } from "@/features/connection/lib/computer-runtime-ready";
import {
  ghCliStatusQueryOptions,
  runtimeInfoQueryOptions,
  terminalOverviewQueryOptions,
  tmuxStatusQueryOptions,
  wsConnectionsQueryOptions,
} from "@/features/system/lib/system-query-options";

export function useTmuxStatusQuery(options?: { enabled?: boolean }) {
  const scope = useComputerQueryScope();
  const runtimeReady = useComputerRuntimeReady();
  return useQuery({
    ...tmuxStatusQueryOptions(scope, runtimeReady),
    enabled: (options?.enabled ?? true) && runtimeReady,
  });
}

export function useRuntimeInfoQuery(options?: { enabled?: boolean }) {
  const scope = useComputerQueryScope();
  const runtimeReady = useComputerRuntimeReady();
  return useQuery({
    ...runtimeInfoQueryOptions(scope, runtimeReady),
    enabled: (options?.enabled ?? true) && runtimeReady,
  });
}

export function useGhCliStatusQuery(options?: { enabled?: boolean }) {
  const scope = useComputerQueryScope();
  const runtimeReady = useComputerRuntimeReady();
  return useQuery({
    ...ghCliStatusQueryOptions(scope, runtimeReady),
    enabled: (options?.enabled ?? true) && runtimeReady,
  });
}

export function useTerminalOverviewQuery(options?: { enabled?: boolean }) {
  const scope = useComputerQueryScope();
  const runtimeReady = useComputerRuntimeReady();
  return useQuery({
    ...terminalOverviewQueryOptions(scope, runtimeReady),
    enabled: (options?.enabled ?? true) && runtimeReady,
  });
}

export function useWsConnectionsQuery(options?: { enabled?: boolean }) {
  const scope = useComputerQueryScope();
  const runtimeReady = useComputerRuntimeReady();
  return useQuery({
    ...wsConnectionsQueryOptions(scope, runtimeReady),
    enabled: (options?.enabled ?? true) && runtimeReady,
  });
}
