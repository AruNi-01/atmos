"use client";

import type { QueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/api/query/query-keys";
import { wsQueryOptions } from "@/api/query/computer-query-options";
import type { ComputerQueryScope } from "@/api/query/query-scope";
import { localModelApi, type LocalModelListResponse } from "@/api/ws/local-model-api";

type ConnectionState = "connecting" | "connected" | "disconnected" | "reconnecting";

export function localModelListQueryOptions(
  scope: ComputerQueryScope,
  connectionState: ConnectionState,
) {
  return wsQueryOptions({
    scope,
    connectionState,
    queryKey: queryKeys.computer.localModelList(scope),
    queryFn: (): Promise<LocalModelListResponse> => localModelApi.list(),
    staleTime: 15_000,
  });
}

/** Invalidate local model list on local_model_state_changed events. */
export function invalidateLocalModelQueries(
  client: QueryClient,
  scope: ComputerQueryScope,
): void {
  void client.invalidateQueries({
    queryKey: queryKeys.computer.localModelList(scope),
    refetchType: "active",
  });
}
