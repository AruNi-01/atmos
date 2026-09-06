"use client";

import { useMemo } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useComputerQueryScope } from "@/api/query/query-scope";
import { useWebSocketStore } from "@/features/connection/hooks/use-websocket";
import {
  gitLogInfiniteQueryOptions,
  GIT_LOG_INFINITE_PAGE_SIZE,
} from "@/features/git/lib/git-query-options";
import type { GitCommit } from "@/features/github/hooks/use-github";

/**
 * Infinite current-branch commit log via `git_log` offset cursor pagination.
 * Used by the Changes scope Commit submenu.
 */
export function useGitLogInfinite({
  repoPath,
  branchKey,
  limit = GIT_LOG_INFINITE_PAGE_SIZE,
  enabled = true,
}: {
  repoPath: string | null | undefined;
  branchKey?: string | null;
  limit?: number;
  enabled?: boolean;
}) {
  const scope = useComputerQueryScope();
  const connectionState = useWebSocketStore((s) => s.connectionState);
  const query = useInfiniteQuery(
    gitLogInfiniteQueryOptions(
      scope,
      connectionState,
      repoPath ?? "",
      { branchKey: branchKey ?? null, limit },
      { enabled: Boolean(repoPath) && enabled },
    ),
  );

  const commits = useMemo(
    () => (query.data?.pages.flatMap((page) => page.commits) ?? []) as GitCommit[],
    [query.data],
  );

  return {
    commits,
    isLoading: query.isLoading,
    isFetchingNextPage: query.isFetchingNextPage,
    hasNextPage: Boolean(query.hasNextPage),
    fetchNextPage: query.fetchNextPage,
  };
}
