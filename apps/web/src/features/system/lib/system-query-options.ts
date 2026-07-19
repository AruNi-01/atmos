"use client";

import { systemApi } from "@/api/rest-api";
import { queryKeys } from "@/api/query/query-keys";
import { restComputerQueryOptions } from "@/api/query/computer-query-options";
import type { ComputerQueryScope } from "@/api/query/query-scope";

export function tmuxStatusQueryOptions(
  scope: ComputerQueryScope,
  runtimeReady: boolean,
  options?: { enabled?: boolean },
) {
  return restComputerQueryOptions({
    scope,
    runtimeReady,
    enabled: options?.enabled,
    queryKey: queryKeys.computer.tmuxStatus(scope),
    queryFn: () => systemApi.getTmuxStatus(),
    ignoreActiveInstance: true,
  });
}

export function runtimeInfoQueryOptions(
  scope: ComputerQueryScope,
  runtimeReady: boolean,
  options?: { enabled?: boolean },
) {
  return restComputerQueryOptions({
    scope,
    runtimeReady,
    enabled: options?.enabled,
    queryKey: queryKeys.computer.runtimeInfo(scope),
    queryFn: () => systemApi.getRuntimeInfo(),
  });
}

export function ghCliStatusQueryOptions(
  scope: ComputerQueryScope,
  runtimeReady: boolean,
  options?: { enabled?: boolean },
) {
  return restComputerQueryOptions({
    scope,
    runtimeReady,
    enabled: options?.enabled,
    queryKey: queryKeys.computer.ghCliStatus(scope),
    queryFn: () => systemApi.getGhCliStatus(),
    ignoreActiveInstance: true,
  });
}

export function gitStatusQueryOptions(
  scope: ComputerQueryScope,
  runtimeReady: boolean,
  options?: { enabled?: boolean },
) {
  return restComputerQueryOptions({
    scope,
    runtimeReady,
    enabled: options?.enabled,
    queryKey: queryKeys.computer.gitStatusSystem(scope),
    queryFn: () => systemApi.getGitStatus(),
    ignoreActiveInstance: true,
  });
}

export function terminalOverviewQueryOptions(
  scope: ComputerQueryScope,
  runtimeReady: boolean,
  options?: { enabled?: boolean },
) {
  return restComputerQueryOptions({
    scope,
    runtimeReady,
    enabled: options?.enabled,
    queryKey: queryKeys.computer.terminalOverview(scope),
    queryFn: () => systemApi.getTerminalOverview(),
  });
}

export function wsConnectionsQueryOptions(
  scope: ComputerQueryScope,
  runtimeReady: boolean,
  options?: { enabled?: boolean },
) {
  return restComputerQueryOptions({
    scope,
    runtimeReady,
    enabled: options?.enabled,
    queryKey: queryKeys.computer.wsConnections(scope),
    queryFn: () => systemApi.getWsConnections(),
  });
}
