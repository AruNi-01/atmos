"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useComputerQueryScope } from "@/api/query/query-scope";
import { useWebSocketStore } from "@/features/connection/hooks/use-websocket";
import { queryKeys } from "@/api/query/query-keys";
import {
  repoPrListQueryOptions,
  branchPrListQueryOptions,
  type RepoPrListParams,
  type BranchPrListParams,
} from "@/features/github/lib/github-query-options";

export function useRepoPrListQuery(params: RepoPrListParams & { enabled?: boolean }) {
  const scope = useComputerQueryScope();
  const connectionState = useWebSocketStore((s) => s.connectionState);
  const { enabled = true, ...restParams } = params;

  return useQuery({
    ...repoPrListQueryOptions(scope, connectionState, restParams),
    enabled: enabled && Boolean(params.owner && params.repo),
  });
}

export function useBranchPrListQuery(params: BranchPrListParams & { enabled?: boolean }) {
  const scope = useComputerQueryScope();
  const connectionState = useWebSocketStore((s) => s.connectionState);
  const { enabled = true, ...restParams } = params;

  return useQuery({
    ...branchPrListQueryOptions(scope, connectionState, restParams),
    enabled: enabled && Boolean(params.owner && params.repo && params.branch),
  });
}

/** Imperatively invalidate all GitHub PR queries (e.g. after a PR mutation). */
export function useInvalidateGithubPrs() {
  const queryClient = useQueryClient();
  const scope = useComputerQueryScope();

  return (params?: { owner?: string; repo?: string }) => {
    const key =
      params?.owner && params?.repo
        ? [...queryKeys.computer.root(scope), "github"]
        : [...queryKeys.computer.root(scope), "github"];
    void queryClient.invalidateQueries({
      queryKey: key,
      refetchType: "active",
    });
  };
}
