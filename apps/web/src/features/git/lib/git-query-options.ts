"use client";

import type { InfiniteData } from "@tanstack/react-query";
import {
  queryKeys,
  GIT_WORKTREE_PARAMS,
  type GitCompareParams,
  type GitFileDiffParams,
} from "@/api/query/query-keys";
import { wsQueryOptions, wsInfiniteQueryOptions } from "@/api/query/computer-query-options";
import type { ComputerQueryScope } from "@/api/query/query-scope";
import { gitApi, type GitStatusResponse, type GitChangedFilesResponse, type GitFileDiffResponse, type GitHistoryPage } from "@/api/ws-api";

export type { GitCompareParams, GitFileDiffParams };
export { GIT_WORKTREE_PARAMS };
export {
  EMPTY_CHANGED_FILES,
  collectStageAllPaths,
  selectCompareChangedFiles,
} from "@/features/git/lib/git-changed-files-selection";

type ConnectionState = "connecting" | "connected" | "disconnected" | "reconnecting";

// ── Compare-params helpers ────────────────────────────────────────────────────

export type GitCompareMode = "branch" | "default-branch" | "ref" | "worktree";

/** True when a non-worktree compare query has enough inputs to request. */
export function isCompareQueryEnabled(
  compareMode: GitCompareMode,
  defaultBranch: string | null | undefined,
): boolean {
  if (compareMode === "worktree") return false;
  if (compareMode === "default-branch") return Boolean(defaultBranch);
  return true;
}

/**
 * Derive the API-level compare params from the orchestration store's compare mode fields.
 * The `defaultBranch` argument is only needed for `default-branch` mode and comes from
 * the git status query result.
 */
export function computeCompareParams(
  compareMode: GitCompareMode,
  defaultBranch: string | null | undefined,
  compareBaseRef: string | null,
): GitCompareParams {
  switch (compareMode) {
    case "default-branch":
      return {
        baseBranch: defaultBranch ?? null,
        baseRef: null,
        commitRef: null,
        usePreferredCompare: false,
      };
    case "ref":
      return {
        baseBranch: null,
        baseRef: null,
        commitRef: compareBaseRef,
        usePreferredCompare: false,
      };
    case "worktree":
      return GIT_WORKTREE_PARAMS;
    case "branch":
    default:
      return {
        baseBranch: null,
        baseRef: null,
        commitRef: null,
        usePreferredCompare: true,
      };
  }
}

// ── Query-options factories ───────────────────────────────────────────────────

/** Keep list snapshots across workspace hops (small payloads; switch should not cold-load). */
const GIT_LIST_STALE_MS = 60_000;
const GIT_LIST_GC_MS = 30 * 60_000;

export function gitStatusQueryOptions(
  scope: ComputerQueryScope,
  connectionState: ConnectionState,
  repoPath: string,
  options?: { enabled?: boolean },
) {
  return wsQueryOptions<GitStatusResponse>({
    scope,
    connectionState,
    enabled: options?.enabled,
    queryKey: queryKeys.computer.gitStatus(scope, repoPath),
    queryFn: () => gitApi.getStatus(repoPath),
    staleTime: GIT_LIST_STALE_MS,
    gcTime: GIT_LIST_GC_MS,
  });
}

export function gitChangedFilesQueryOptions(
  scope: ComputerQueryScope,
  connectionState: ConnectionState,
  repoPath: string,
  params: GitCompareParams,
  options?: { enabled?: boolean },
) {
  return wsQueryOptions<GitChangedFilesResponse>({
    scope,
    connectionState,
    enabled: options?.enabled,
    queryKey: queryKeys.computer.gitChangedFiles(scope, repoPath, params),
    queryFn: () =>
      gitApi.getChangedFiles(repoPath, params.baseBranch, params.usePreferredCompare, {
        baseRef: params.baseRef,
        commitRef: params.commitRef,
      }),
    staleTime: GIT_LIST_STALE_MS,
    gcTime: GIT_LIST_GC_MS,
  });
}

export function gitFileDiffQueryOptions(
  scope: ComputerQueryScope,
  connectionState: ConnectionState,
  repoPath: string,
  filePath: string,
  params: GitFileDiffParams,
  options?: { enabled?: boolean },
) {
  return wsQueryOptions<GitFileDiffResponse>({
    scope,
    connectionState,
    enabled: (options?.enabled ?? true) && Boolean(repoPath) && Boolean(filePath),
    queryKey: queryKeys.computer.gitFileDiff(scope, repoPath, filePath, params),
    queryFn: () =>
      gitApi.getFileDiff(repoPath, filePath, params.baseBranch, {
        againstIndex: params.againstIndex,
        baseRef: params.baseRef,
        commitRef: params.commitRef,
      }),
    staleTime: 30_000,
  });
}

export function gitBranchesQueryOptions(
  scope: ComputerQueryScope,
  connectionState: ConnectionState,
  repoPath: string,
  options?: { enabled?: boolean },
) {
  return wsQueryOptions<{ local: string[]; remote: string[] }>({
    scope,
    connectionState,
    enabled: options?.enabled,
    queryKey: queryKeys.computer.gitBranches(scope, repoPath),
    queryFn: async () => {
      const [local, remote] = await Promise.all([
        gitApi.listBranches(repoPath),
        gitApi.listRemoteBranches(repoPath),
      ]);
      return { local, remote };
    },
    staleTime: GIT_LIST_STALE_MS,
    gcTime: GIT_LIST_GC_MS,
  });
}

/** Opaque commit rows from `git_log` — shape is owned by the WS payload. */
export type GitLogPage = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  commits: any[];
};

export function gitLogQueryOptions(
  scope: ComputerQueryScope,
  connectionState: ConnectionState,
  repoPath: string,
  params: { branchKey: string | null; limit: number; page: number },
  options?: { enabled?: boolean },
) {
  return wsQueryOptions<GitLogPage>({
    scope,
    connectionState,
    enabled: options?.enabled,
    queryKey: queryKeys.computer.gitLog(scope, repoPath, params),
    queryFn: async () => {
      // Lazy import avoids circular dependency with the WS client module graph.
      const { useWebSocketStore } = await import(
        "@/features/connection/hooks/use-websocket"
      );
      const result = await useWebSocketStore.getState().send("git_log", {
        path: repoPath,
        limit: params.limit,
        offset: params.page * params.limit,
      });
      return { commits: result?.commits ?? [] };
    },
    staleTime: GIT_LIST_STALE_MS,
    gcTime: GIT_LIST_GC_MS,
  });
}

/** Default page size for Changes scope Commit submenu infinite scroll. */
export const GIT_LOG_INFINITE_PAGE_SIZE = 30;

/**
 * Current-branch `git_log` infinite query.
 * Backend pagination is offset-based; pageParam is that offset (skip cursor).
 */
export function gitLogInfiniteQueryOptions(
  scope: ComputerQueryScope,
  connectionState: ConnectionState,
  repoPath: string,
  params: { branchKey: string | null; limit?: number },
  options?: { enabled?: boolean },
) {
  const limit = params.limit ?? GIT_LOG_INFINITE_PAGE_SIZE;
  return wsInfiniteQueryOptions<
    GitLogPage,
    Error,
    InfiniteData<GitLogPage>,
    ReturnType<typeof queryKeys.computer.gitLogInfinite>,
    number
  >({
    scope,
    connectionState,
    enabled: options?.enabled,
    queryKey: queryKeys.computer.gitLogInfinite(scope, repoPath, {
      branchKey: params.branchKey,
      limit,
    }),
    queryFn: async ({ pageParam }) => {
      const { useWebSocketStore } = await import(
        "@/features/connection/hooks/use-websocket"
      );
      const result = await useWebSocketStore.getState().send("git_log", {
        path: repoPath,
        limit,
        offset: pageParam,
      });
      return { commits: result?.commits ?? [] };
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, _pages, lastPageParam) => {
      // Match `useGitLog` page*limit offsets; stop when a short page arrives.
      if (lastPage.commits.length < limit) return undefined;
      return lastPageParam + limit;
    },
    staleTime: GIT_LIST_STALE_MS,
    gcTime: GIT_LIST_GC_MS,
  });
}

/** Zed streams graph SHAs in 1000-commit chunks; we page at the same size. */
export const GIT_HISTORY_PAGE_SIZE = 1000;
/** Prefetch this many pages on open, then load more from the virtualizer. */
export const GIT_HISTORY_PREFETCH_PAGES = 2;

export function gitHistoryInfiniteQueryOptions(
  scope: ComputerQueryScope,
  connectionState: ConnectionState,
  repoPath: string,
  options?: { enabled?: boolean },
) {
  return wsInfiniteQueryOptions<
    GitHistoryPage,
    Error,
    InfiniteData<GitHistoryPage>,
    ReturnType<typeof queryKeys.computer.gitHistory>,
    number
  >({
    scope,
    connectionState,
    enabled: options?.enabled,
    queryKey: queryKeys.computer.gitHistory(scope, repoPath),
    queryFn: ({ pageParam }) =>
      gitApi.getHistory(repoPath, {
        cursor: pageParam,
        limit: GIT_HISTORY_PAGE_SIZE,
      }),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.next_cursor ?? undefined,
    staleTime: GIT_LIST_STALE_MS,
    gcTime: GIT_LIST_GC_MS,
  });
}
