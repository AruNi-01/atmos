import { useState, useCallback, useEffect, useRef, startTransition } from 'react';
import { useWebSocketStore } from '@/features/connection/hooks/use-websocket';
import {
  getCachedBranchPrs,
  getRepoPrSeedForBranch,
  setCachedBranchPrs,
  type BranchPr,
} from '@/features/github/lib/github-pr-cache';

export interface GithubContext {
  owner?: string;
  repo?: string;
  branch?: string;
}

// PR 列表
export function useGithubPRList({
  owner,
  repo,
  branch,
  state,
  emitBranchStatusRefresh = false,
  enabled = true,
  preferRepoCache = false,
}: GithubContext & {
  state?: string;
  emitBranchStatusRefresh?: boolean;
  enabled?: boolean;
  preferRepoCache?: boolean;
}) {
  const send = useWebSocketStore(s => s.send);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const fetch = useCallback(async (options?: { force?: boolean }) => {
    if (!enabled || !owner || !repo || !branch) return;
    if (!options?.force) {
      const cached = getCachedBranchPrs({ owner, repo, branch, state });
      if (cached) {
        setData(cached);
        return;
      }

      if (preferRepoCache) {
        const seeded = getRepoPrSeedForBranch({ owner, repo, branch, state });
        if (seeded) {
          setCachedBranchPrs({ owner, repo, branch, state }, seeded);
          setData(seeded);
          return;
        }
      }
    }

    setLoading(true);
    try {
      const result = await send('github_pr_list', {
        owner,
        repo,
        branch,
        state,
        emit_branch_status_refresh: emitBranchStatusRefresh,
      });
      if (Array.isArray(result)) {
        setCachedBranchPrs({ owner, repo, branch, state }, result as BranchPr[]);
      }
      setData(result);
    } catch (e) {
      console.error(e);
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [owner, repo, branch, state, send, emitBranchStatusRefresh, enabled, preferRepoCache]);

  useEffect(() => { 
    if (!enabled) return;
    fetch(); 
  }, [enabled, fetch]);

  const refresh = useCallback(() => fetch({ force: true }), [fetch]);

  return { data, loading, refresh };
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

export function useGithubPRDetail(prNumber: number, owner?: string, repo?: string) {
  const send = useWebSocketStore(s => s.send);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const fetch = useCallback(async () => {
    if (!owner || !repo || !prNumber) return;
    setLoading(true);
    try {
      const result = await send('github_pr_detail', { owner, repo, pr_number: prNumber });
      setData(result);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [owner, repo, prNumber, send]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { data, loading, fetch };
}

const TIMELINE_PER_PAGE = 100;

export function useGithubPRTimeline(prNumber: number, owner?: string, repo?: string, enabled = true) {
  const send = useWebSocketStore(s => s.send);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [items, setItems] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const nextPageRef = useRef(1);
  const fetchingRef = useRef(false);

  const fetchPage = useCallback(async (page: number) => {
    if (!owner || !repo || !prNumber) return;
    setIsLoading(true);
    try {
      const result = await send('github_pr_timeline_page', {
        owner,
        repo,
        pr_number: prNumber,
        page,
        per_page: TIMELINE_PER_PAGE,
      }) as { items: unknown[]; has_more: boolean };

      const newItems = Array.isArray(result?.items) ? result.items : [];
      nextPageRef.current = page + 1;
      const more = result?.has_more ?? false;
      startTransition(() => {
        setItems(prev => page === 1 ? newItems : [...prev, ...newItems]);
        setHasMore(more);
      });
      // Auto-fetch next page
      if (more) {
        void fetchPage(page + 1);
      } else {
        fetchingRef.current = false;
      }
    } catch (e) {
      console.error('Failed to fetch PR timeline page', e);
      setHasMore(false);
      fetchingRef.current = false;
    } finally {
      setIsLoading(false);
    }
  }, [owner, repo, prNumber, send]);

  useEffect(() => {
    setItems([]);
    setHasMore(false);
    fetchingRef.current = false;
    if (!enabled || !owner || !repo || !prNumber) return;
    nextPageRef.current = 1;
    fetchingRef.current = true;
    void fetchPage(1);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prNumber, owner, repo, enabled]);

  const loadMore = useCallback(() => {
    void fetchPage(nextPageRef.current);
  }, [fetchPage]);

  return { items, isLoading, hasMore, loadMore };
}

export interface PrFile {
  sha: string;
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  changes: number;
  patch?: string;
}

export function useGithubPRFiles(prNumber: number, owner?: string, repo?: string, enabled = true) {
  const send = useWebSocketStore(s => s.send);
  const [files, setFiles] = useState<PrFile[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled || !owner || !repo || !prNumber) return;
    let cancelled = false;

    const loadFiles = async () => {
      setFiles([]);
      setLoading(true);
      try {
        const result = await send('github_pr_files', { owner, repo, pr_number: prNumber });
        if (!cancelled) setFiles(Array.isArray(result) ? result as PrFile[] : []);
      } catch (error) {
        console.error(error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void loadFiles();
    return () => { cancelled = true; };
  }, [prNumber, owner, repo, enabled, send]);

  return { files, loading };
}

export function useGithubPRDetailSidebar(prNumber: number, owner?: string, repo?: string) {
  const send = useWebSocketStore(s => s.send);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const fetch = useCallback(async () => {
    if (!owner || !repo || !prNumber) return;
    setLoading(true);
    try {
      const result = await send('github_pr_detail_sidebar', { owner, repo, pr_number: prNumber });
      setData(result);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [owner, repo, prNumber, send]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { data, loading, fetch };
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
  const [commitState, setCommitState] = useState<{
    scopeKey: string | null | undefined;
    commits: GitCommit[];
  }>({ scopeKey: branchKey, commits: [] });
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const requestIdRef = useRef(0);
  const branchKeyRef = useRef(branchKey);
  if (branchKeyRef.current !== branchKey) {
    branchKeyRef.current = branchKey;
    requestIdRef.current += 1;
  }

  const fetchPage = useCallback(async (pageIndex: number) => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    const requestBranchKey = branchKeyRef.current;

    if (!repoPath) {
      setCommitState({ scopeKey: requestBranchKey, commits: [] });
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
        branchKeyRef.current !== requestBranchKey
      ) {
        return;
      }
      const fetched: GitCommit[] = result?.commits ?? [];
      setCommitState({ scopeKey: requestBranchKey, commits: fetched });
      setHasMore(fetched.length >= limit);
      setPage(pageIndex);
    } catch (e) {
      if (
        requestIdRef.current !== requestId ||
        branchKeyRef.current !== requestBranchKey
      ) {
        return;
      }
      console.error(e);
      setCommitState({ scopeKey: requestBranchKey, commits: [] });
    } finally {
      if (
        requestIdRef.current === requestId &&
        branchKeyRef.current === requestBranchKey
      ) {
        setLoading(false);
      }
    }
  }, [repoPath, limit, send]);

  const resetAndFetchPage = useCallback((pageIndex: number) => {
    setCommitState({ scopeKey: branchKeyRef.current, commits: [] });
    setHasMore(false);
    setPage(0);
    void fetchPage(pageIndex);
  }, [fetchPage]);

  useEffect(() => {
    resetAndFetchPage(0);
  }, [branchKey, resetAndFetchPage]);

  const goToPrevPage = useCallback(() => {
    if (page > 0) fetchPage(page - 1);
  }, [page, fetchPage]);

  const goToNextPage = useCallback(() => {
    if (hasMore) fetchPage(page + 1);
  }, [page, hasMore, fetchPage]);

  const refresh = useCallback(() => fetchPage(page), [fetchPage, page]);

  const isCurrentScope = commitState.scopeKey === branchKey;
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
