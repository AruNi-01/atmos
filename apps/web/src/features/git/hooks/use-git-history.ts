"use client";

import { useMemo } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useComputerQueryScope } from "@/api/query/query-scope";
import { useWebSocketStore } from "@/features/connection/hooks/use-websocket";
import { gitHistoryInfiniteQueryOptions } from "@/features/git/lib/git-query-options";

export function useGitHistory(repoPath: string | null | undefined) {
  const scope = useComputerQueryScope();
  const connectionState = useWebSocketStore((s) => s.connectionState);
  const query = useInfiniteQuery(
    gitHistoryInfiniteQueryOptions(scope, connectionState, repoPath ?? "", {
      enabled: Boolean(repoPath),
    }),
  );

  const commits = useMemo(
    () => query.data?.pages.flatMap((page) => page.commits) ?? [],
    [query.data],
  );
  const firstPage = query.data?.pages[0];

  return {
    commits,
    headSha: firstPage?.head_sha ?? null,
    totalCount: firstPage?.total_count ?? null,
    hasNextPage: Boolean(query.hasNextPage),
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isFetchingNextPage: query.isFetchingNextPage,
    error: query.error,
    fetchNextPage: query.fetchNextPage,
    refetch: query.refetch,
  };
}
