import { useState, useCallback, useEffect, useRef } from 'react';
import { useWebSocketStore } from '@/features/connection/hooks/use-websocket';
import {
  useBranchPrListQuery,
  useGithubPrDetailQuery,
  useGithubPrDetailSidebarQuery,
  useGithubPrFilesQuery,
  useGithubPrTimelineInfiniteQuery,
} from '@/features/github/hooks/use-github-pr-query';
import type { PrFile } from '@/features/github/lib/github-query-options';

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
    loading: isLoading || isFetching,
    refresh,
  };
}

// CI 状态（in_progress 时自动轮询）
export function useGithubCIStatus({ owner, repo, branch }: GithubContext) {
  const send = useWebSocketStore(s => s.send);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    if (!owner || !repo || !branch) return;
    
    let timer: ReturnType<typeof setTimeout> | null = null;
    let isMounted = true;

    const fetch = async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = await send('github_ci_status', { owner, repo, branch }) as any;
        if (!isMounted) return;
        setData(result);
        if (result?.status === 'in_progress' || result?.status === 'queued') {
          timer = setTimeout(fetch, 30_000); // 30s
        }
      } catch (e) {
        console.error(e);
      }
    };

    fetch();
    return () => { 
      isMounted = false;
      if (timer) clearTimeout(timer); 
    };
  }, [owner, repo, branch, send]);

  return data;
}

/** PR detail — TanStack Query (cached across modal close/reopen). */
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

/** PR sidebar — TanStack Query (cached across modal close/reopen). */
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
  const send = useWebSocketStore(s => s.send);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [data, setData] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(false);

  const fetch = useCallback(async (isAuto = false) => {
    if (!enabled || !owner || !repo || !branch) return;
    if (!isAuto) setLoading(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await send('github_actions_list', { owner, repo, branch }) as any[];
      setData(result);

      return result;
    } catch (e) {
      console.error(e);
      return null;
    } finally {
      if (!isAuto) setLoading(false);
    }
  }, [owner, repo, branch, send, enabled]);

  useEffect(() => {
    if (!enabled || !owner || !repo || !branch) return;
    
    let timer: ReturnType<typeof setTimeout> | null = null;
    let isMounted = true;
    let isInitial = true;

    const poll = async () => {
      // Use isAuto=false for the first fetch so setLoading(true) fires,
      // then isAuto=true for subsequent auto-refreshes.
      const result = await fetch(!isInitial);
      isInitial = false;
      if (!isMounted) return;
      
      const hasInProgress = result?.some(r => r.status === 'in_progress' || r.status === 'queued');
      if (hasInProgress) {
        timer = setTimeout(poll, 30_000); // 30s
      }
    };

    poll();

    return () => { 
      isMounted = false;
      if (timer) clearTimeout(timer); 
    };
  }, [fetch, enabled, owner, repo, branch]);

  return { data, loading, refresh: () => fetch() };
}

export function useGithubActionsDetail(owner: string, repo: string, runId: number | undefined) {
  const send = useWebSocketStore(s => s.send);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!owner || !repo || !runId) {
      setData(null);
      return;
    }

    let isMounted = true;
    const fetchDetail = async () => {
      setLoading(true);
      try {
        const result = await send('github_actions_detail', { owner, repo, run_id: runId });
        if (!isMounted) return;
        setData(result);
      } catch (err) {
        console.error(err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchDetail();
    return () => { isMounted = false; };
  }, [owner, repo, runId, send]);

  return { data, loading };
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

// Local Git commit log (current branch)
export function useGitLog({
  repoPath,
  branchKey,
  limit = 30,
}: {
  repoPath: string | null;
  branchKey?: string | null;
  limit?: number;
}) {
  const send = useWebSocketStore(s => s.send);
  const scopeKey = repoPath ? `${repoPath}\u0000${branchKey ?? ''}` : null;
  const [commitState, setCommitState] = useState<{
    scopeKey: string | null;
    commits: GitCommit[];
  }>({ scopeKey, commits: [] });
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const requestIdRef = useRef(0);
  const scopeKeyRef = useRef(scopeKey);
  if (scopeKeyRef.current !== scopeKey) {
    scopeKeyRef.current = scopeKey;
    requestIdRef.current += 1;
  }

  const fetchPage = useCallback(async (pageIndex: number) => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    const requestScopeKey = scopeKeyRef.current;

    if (!repoPath) {
      setCommitState({ scopeKey: requestScopeKey, commits: [] });
      setHasMore(false);
      setPage(0);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await send<any>('git_log', {
        path: repoPath,
        limit,
        offset: pageIndex * limit,
      });
      if (
        requestIdRef.current !== requestId ||
        scopeKeyRef.current !== requestScopeKey
      ) {
        return;
      }
      const fetched: GitCommit[] = result?.commits ?? [];
      setCommitState({ scopeKey: requestScopeKey, commits: fetched });
      setHasMore(fetched.length >= limit);
      setPage(pageIndex);
    } catch (e) {
      if (
        requestIdRef.current !== requestId ||
        scopeKeyRef.current !== requestScopeKey
      ) {
        return;
      }
      console.error(e);
      setCommitState({ scopeKey: requestScopeKey, commits: [] });
    } finally {
      if (
        requestIdRef.current === requestId &&
        scopeKeyRef.current === requestScopeKey
      ) {
        setLoading(false);
      }
    }
  }, [repoPath, limit, send]);

  const resetAndFetchPage = useCallback((pageIndex: number) => {
    setCommitState({ scopeKey: scopeKeyRef.current, commits: [] });
    setHasMore(false);
    setPage(0);
    void fetchPage(pageIndex);
  }, [fetchPage]);

  useEffect(() => {
    resetAndFetchPage(0);
  }, [scopeKey, resetAndFetchPage]);

  const goToPrevPage = useCallback(() => {
    if (page > 0) fetchPage(page - 1);
  }, [page, fetchPage]);

  const goToNextPage = useCallback(() => {
    if (hasMore) fetchPage(page + 1);
  }, [page, hasMore, fetchPage]);

  const refresh = useCallback(() => fetchPage(page), [fetchPage, page]);

  const isCurrentScope = commitState.scopeKey === scopeKey;
  return {
    commits: isCurrentScope ? commitState.commits : [],
    loading: loading || (!!repoPath && !isCurrentScope),
    page: isCurrentScope ? page : 0,
    hasMore: isCurrentScope ? hasMore : false,
    goToPrevPage,
    goToNextPage,
    refresh,
  };
}
