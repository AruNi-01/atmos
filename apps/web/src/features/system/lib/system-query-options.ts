"use client";

import { systemApi } from "@/api/rest-api";
import { queryKeys } from "@/api/query/query-keys";
import { restComputerQueryOptions } from "@/api/query/computer-query-options";
import type { ComputerQueryScope } from "@/api/query/query-scope";

export function tmuxStatusQueryOptions(
  scope: ComputerQueryScope,
  runtimeReady: boolean,
) {
  return restComputerQueryOptions({
    scope,
    runtimeReady,
    queryKey: queryKeys.computer.tmuxStatus(scope),
    queryFn: () => systemApi.getTmuxStatus(),
  });
}

export function runtimeInfoQueryOptions(
  scope: ComputerQueryScope,
  runtimeReady: boolean,
) {
  return restComputerQueryOptions({
    scope,
    runtimeReady,
    queryKey: queryKeys.computer.runtimeInfo(scope),
    queryFn: () => systemApi.getRuntimeInfo(),
  });
}

export function ghCliStatusQueryOptions(
  scope: ComputerQueryScope,
  runtimeReady: boolean,
) {
  return restComputerQueryOptions({
    scope,
    runtimeReady,
    queryKey: queryKeys.computer.ghCliStatus(scope),
    queryFn: () => systemApi.getGhCliStatus(),
  });
}

export function terminalOverviewQueryOptions(
  scope: ComputerQueryScope,
  runtimeReady: boolean,
) {
  return restComputerQueryOptions({
    scope,
    runtimeReady,
    queryKey: queryKeys.computer.terminalOverview(scope),
    queryFn: () => systemApi.getTerminalOverview(),
  });
}

export function wsConnectionsQueryOptions(
  scope: ComputerQueryScope,
  runtimeReady: boolean,
) {
  return restComputerQueryOptions({
    scope,
    runtimeReady,
    queryKey: queryKeys.computer.wsConnections(scope),
    queryFn: () => systemApi.getWsConnections(),
  });
}
