"use client";

import { useEffect, useMemo } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useComputerQueryScope } from "@/api/query/query-scope";
import { useWebSocketStore } from "@/features/connection/hooks/use-websocket";
import { queryKeys } from "@/api/query/query-keys";
import {
  repoPrListQueryOptions,
  branchPrListQueryOptions,
  githubPrDetailQueryOptions,
  githubPrDetailSidebarQueryOptions,
  githubPrFilesQueryOptions,
  githubPrTimelineInfiniteQueryOptions,
  type RepoPrListParams,
  type BranchPrListParams,
  type GithubPrIdentityParams,
} from "@/features/github/lib/github-query-options";

export function useRepoPrListQuery(params: RepoPrListParams & { enabled?: boolean }) {
  const scope = useComputerQueryScope();
  const connectionState = useWebSocketStore((s) => s.connectionState);
  const { enabled = true, ...restParams } = params;

  return useQuery(
    repoPrListQueryOptions(scope, connectionState, restParams, {
      enabled: enabled && Boolean(params.owner && params.repo),
    }),
  );
}

export function useBranchPrListQuery(params: BranchPrListParams & { enabled?: boolean }) {
  const scope = useComputerQueryScope();
  const connectionState = useWebSocketStore((s) => s.connectionState);
  const { enabled = true, ...restParams } = params;

  return useQuery(
    branchPrListQueryOptions(scope, connectionState, restParams, {
      enabled: enabled && Boolean(params.owner && params.repo && params.branch),
    }),
  );
}

export function useGithubPrDetailQuery(params: GithubPrIdentityParams & { enabled?: boolean }) {
  const scope = useComputerQueryScope();
  const connectionState = useWebSocketStore((s) => s.connectionState);
  const { enabled = true, ...restParams } = params;

  return useQuery(
    githubPrDetailQueryOptions(scope, connectionState, restParams, {
      enabled: enabled && Boolean(params.owner && params.repo && params.prNumber),
    }),
  );
}

export function useGithubPrDetailSidebarQuery(
  params: GithubPrIdentityParams & { enabled?: boolean },
) {
  const scope = useComputerQueryScope();
  const connectionState = useWebSocketStore((s) => s.connectionState);
  const { enabled = true, ...restParams } = params;

  return useQuery(
    githubPrDetailSidebarQueryOptions(scope, connectionState, restParams, {
      enabled: enabled && Boolean(params.owner && params.repo && params.prNumber),
    }),
  );
}

export function useGithubPrFilesQuery(params: GithubPrIdentityParams & { enabled?: boolean }) {
  const scope = useComputerQueryScope();
  const connectionState = useWebSocketStore((s) => s.connectionState);
  const { enabled = true, ...restParams } = params;

  return useQuery(
    githubPrFilesQueryOptions(scope, connectionState, restParams, {
      enabled: enabled && Boolean(params.owner && params.repo && params.prNumber),
    }),
  );
}

export function useGithubPrTimelineInfiniteQuery(
  params: GithubPrIdentityParams & { enabled?: boolean },
) {
  const scope = useComputerQueryScope();
  const connectionState = useWebSocketStore((s) => s.connectionState);
  const { enabled = true, ...restParams } = params;

  const query = useInfiniteQuery(
    githubPrTimelineInfiniteQueryOptions(scope, connectionState, restParams, {
      enabled: enabled && Boolean(params.owner && params.repo && params.prNumber),
    }),
  );

  // Preserve legacy auto-chain: keep fetching until has_more is false.
  useEffect(() => {
    if (!enabled) return;
    if (query.hasNextPage && !query.isFetchingNextPage && !query.isLoading) {
      void query.fetchNextPage();
    }
  }, [
    enabled,
    query.fetchNextPage,
    query.hasNextPage,
    query.isFetchingNextPage,
    query.isLoading,
  ]);

  const items = useMemo(
    () => query.data?.pages.flatMap((page) => page.items) ?? [],
    [query.data],
  );

  return {
    ...query,
    items,
  };
}

/** Imperatively invalidate GitHub PR queries (e.g. after a PR mutation). */
export function useInvalidateGithubPrs() {
  const queryClient = useQueryClient();
  const scope = useComputerQueryScope();

  return (params?: { owner?: string; repo?: string; prNumber?: number }) => {
    if (params?.owner && params?.repo && params.prNumber) {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.computer.githubPrDetail(scope, {
          owner: params.owner,
          repo: params.repo,
          prNumber: params.prNumber,
        }),
        refetchType: "active",
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.computer.githubPrDetailSidebar(scope, {
          owner: params.owner,
          repo: params.repo,
          prNumber: params.prNumber,
        }),
        refetchType: "active",
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.computer.githubPrFiles(scope, {
          owner: params.owner,
          repo: params.repo,
          prNumber: params.prNumber,
        }),
        refetchType: "active",
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.computer.githubPrTimeline(scope, {
          owner: params.owner,
          repo: params.repo,
          prNumber: params.prNumber,
        }),
        refetchType: "active",
      });
    }

    if (params?.owner && params?.repo) {
      void queryClient.invalidateQueries({
        queryKey: [...queryKeys.computer.root(scope), "github", "repoPrs", params.owner, params.repo],
        refetchType: "active",
      });
      void queryClient.invalidateQueries({
        queryKey: [...queryKeys.computer.root(scope), "github", "branchPrs", params.owner, params.repo],
        refetchType: "active",
      });
      return;
    }
    void queryClient.invalidateQueries({
      queryKey: [...queryKeys.computer.root(scope), "github"],
      refetchType: "active",
    });
  };
}
