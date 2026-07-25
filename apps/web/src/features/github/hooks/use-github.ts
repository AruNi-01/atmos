import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useWebSocketStore } from '@/features/connection/hooks/use-websocket';
import { useComputerQueryScope } from '@/api/query/query-scope';
import {
  useBranchPrListQuery,
  useGithubPrDetailQuery,
  useGithubPrDetailSidebarQuery,
  useGithubPrFilesQuery,
  useGithubPrTimelineInfiniteQuery,
  useGithubActionsListQuery,
  useGithubActionsDetailQuery,
  useGithubCiStatusQuery,
} from '@/features/github/hooks/use-github-pr-query';
import type { PrFile } from '@/features/github/lib/github-query-options';
import { gitLogQueryOptions } from '@/features/git/lib/git-query-options';
import { useSessionListQuery } from '@/features/workspace/hooks/use-session-list-query';
import { sessionListKeys } from '@/features/workspace/store/session-list-snapshot-store';

export type { PrFile };

export interface GithubContext {
  owner?: string;
  repo?: string;
  branch?: string;
}

// PR 列表 — backed by TanStack Query (APP-035 cutover)
export function useGithubPRList({
  owner,
  repo,
  branch,
  state,
  emitBranchStatusRefresh = false,
  enabled = true,
}: GithubContext & {
  state?: string;
  emitBranchStatusRefresh?: boolean;
  enabled?: boolean;
  /** @deprecated preferRepoCache is no longer needed; Query cache handles deduplication */
  preferRepoCache?: boolean;
}) {
  const query = useBranchPrListQuery({
    owner: owner ?? "",
    repo: repo ?? "",
    branch: branch ?? "",
    state,
    emitBranchStatusRefresh,
    enabled: enabled && Boolean(owner && repo && branch),
  });

  const { refetch, data, isLoading, isFetching } = query;
  const refresh = useCallback(() => {
    return refetch();
  }, [refetch]);

  return {
    data: data ?? null,
    // isLoading = first load without cache. Background refetch (isFetching) must not
    // blank the list on workspace switch when TanStack still has data for this key.
    loading: isLoading,
    refreshing: isFetching && !isLoading,
    refresh,
  };
}

// CI 状态（in_progress 时自动轮询）
export function useGithubCIStatus({ owner, repo, branch }: GithubContext) {
  const query = useGithubCiStatusQuery({
    owner: owner ?? "",
    repo: repo ?? "",
    branch: branch ?? "",
    enabled: Boolean(owner && repo && branch),
  });

  const status = query.data?.status;
  const isPending = status === 'in_progress' || status === 'queued';

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    if (isPending) {
      timer = setTimeout(() => {
        void query.refetch();
      }, 30_000); // 30s poll
    }
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [isPending, query.refetch]);
  
  return query.data ?? null;
}

/** PR detail — TanStack Query (cached across center-tab close/reopen). */
export function useGithubPRDetail(
  prNumber: number,
  owner?: string,
  repo?: string,
  enabled = true,
) {
  const query = useGithubPrDetailQuery({
    owner: owner ?? "",
    repo: repo ?? "",
    prNumber,
    enabled: enabled && Boolean(owner && repo && prNumber),
  });

  const fetch = useCallback(async () => {
    await query.refetch();
  }, [query.refetch]);

  return {
    data: query.data ?? null,
    loading: query.isLoading,
    fetch,
  };
}

/** PR timeline — infinite Query with legacy auto-page chaining. */
export function useGithubPRTimeline(
  prNumber: number,
  owner?: string,
  repo?: string,
  enabled = true,
) {
  const query = useGithubPrTimelineInfiniteQuery({
    owner: owner ?? "",
    repo: repo ?? "",
    prNumber,
    enabled: enabled && Boolean(owner && repo && prNumber),
  });

  const loadMore = useCallback(() => {
    if (query.hasNextPage && !query.isFetchingNextPage) {
      void query.fetchNextPage();
    }
  }, [query.fetchNextPage, query.hasNextPage, query.isFetchingNextPage]);

  return {
    items: query.items,
    isLoading: query.isLoading || query.isFetchingNextPage,
    hasMore: Boolean(query.hasNextPage),
    loadMore,
  };
}

export function useGithubPRFiles(
  prNumber: number,
  owner?: string,
  repo?: string,
  enabled = true,
) {
  const query = useGithubPrFilesQuery({
    owner: owner ?? "",
    repo: repo ?? "",
    prNumber,
    enabled: enabled && Boolean(owner && repo && prNumber),
  });

  return {
    files: query.data ?? [],
    loading: query.isLoading,
  };
}

/** PR sidebar — TanStack Query (cached across center-tab close/reopen). */
export function useGithubPRDetailSidebar(
  prNumber: number,
  owner?: string,
  repo?: string,
  enabled = true,
) {
  const query = useGithubPrDetailSidebarQuery({
    owner: owner ?? "",
    repo: repo ?? "",
    prNumber,
    enabled: enabled && Boolean(owner && repo && prNumber),
  });

  const fetch = useCallback(async () => {
    await query.refetch();
  }, [query.refetch]);

  return {
    data: query.data ?? null,
    loading: query.isLoading,
    fetch,
  };
}

// Actions List
export function useGithubActionsList({ owner, repo, branch, enabled = true }: GithubContext & { enabled?: boolean }) {
  const query = useGithubActionsListQuery({
    owner: owner ?? "",
    repo: repo ?? "",
    branch: branch ?? "",
    enabled: enabled && Boolean(owner && repo && branch),
  });

  const hasInProgress = useMemo(() => {
    return query.data?.some(r => r.status === 'in_progress' || r.status === 'queued') ?? false;
  }, [query.data]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    if (hasInProgress) {
      timer = setTimeout(() => {
        void query.refetch();
      }, 30_000); // 30s
    }
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [hasInProgress, query.refetch]);

  const refresh = useCallback(async () => {
    await query.refetch();
    return query.data;
  }, [query.refetch, query.data]);

  return { data: query.data ?? null, loading: query.isLoading, refresh };
}

export function useGithubActionsDetail(owner: string, repo: string, runId: number | undefined) {
  const query = useGithubActionsDetailQuery({
    owner,
    repo,
    runId: runId ?? 0,
    enabled: Boolean(owner && repo && runId),
  });

  // Action detail has jobs, if the action is not complete, we should poll
  const status = query.data?.status;
  const isPending = status === 'in_progress' || status === 'queued';

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    if (isPending) {
      timer = setTimeout(() => {
        void query.refetch();
      }, 30_000); // 30s
    }
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [isPending, query.refetch]);

  return { data: query.data ?? null, loading: query.isLoading };
}

export interface GitCommit {
  hash: string;
  short_hash: string;
  author_name: string;
  author_email: string;
  timestamp: number;
  subject: string;
  body: string;
  is_pushed: boolean;
  author_avatar_url?: string;
}

// Local Git commit log — Query + session snapshot for long-idle workspace hops.
export function useGitLog({
  repoPath,
  branchKey,
  limit = 30,
}: {
  repoPath: string | null;
  branchKey?: string | null;
  limit?: number;
}) {
  const scope = useComputerQueryScope();
  const connectionState = useWebSocketStore((s) => s.connectionState);
  const scopeKey = repoPath ? `${repoPath}\u0000${branchKey ?? ""}` : null;
  const [page, setPage] = useState(0);

  useEffect(() => {
    setPage(0);
  }, [scopeKey]);

  const sessionKey = repoPath
    ? sessionListKeys.gitLog(repoPath, branchKey ?? null, page, limit)
    : null;

  const query = useSessionListQuery(
    sessionKey,
    gitLogQueryOptions(
      scope,
      connectionState,
      repoPath ?? "",
      {
        branchKey: branchKey ?? null,
        limit,
        page,
      },
      { enabled: Boolean(repoPath) },
    ),
  );

  const commits = (query.data?.commits ?? []) as GitCommit[];
  const hasMore = commits.length >= limit;

  const goToPrevPage = useCallback(() => {
    setPage((p) => Math.max(0, p - 1));
  }, []);

  const goToNextPage = useCallback(() => {
    if (hasMore) setPage((p) => p + 1);
  }, [hasMore]);

  const refresh = useCallback(() => {
    void query.refetch();
  }, [query]);

  return {
    commits,
    // Session snapshot / Query cache both suppress first-load spinner on hop-back.
    loading: query.isLoading,
    page,
    hasMore,
    goToPrevPage,
    goToNextPage,
    refresh,
  };
}
