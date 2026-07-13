"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useComputerQueryScope } from "@/api/query/query-scope";
import { useWebSocketStore } from "@/features/connection/hooks/use-websocket";
import { localModelListQueryOptions } from "@/features/local-services/lib/local-model-query-options";
import { queryKeys } from "@/api/query/query-keys";

export function useLocalModelListQuery() {
  const scope = useComputerQueryScope();
  const connectionState = useWebSocketStore((s) => s.connectionState);

  return useQuery(localModelListQueryOptions(scope, connectionState));
}

/** Imperatively invalidate local model list (e.g. after download/start/stop). */
export function useInvalidateLocalModels() {
  const queryClient = useQueryClient();
  const scope = useComputerQueryScope();

  return () => {
    void queryClient.invalidateQueries({
      queryKey: queryKeys.computer.localModelList(scope),
      refetchType: "active",
    });
  };
}
