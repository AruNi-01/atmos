"use client";

import {
  queryKeys,
  GIT_WORKTREE_PARAMS,
  type GitCompareParams,
  type GitFileDiffParams,
} from "@/api/query/query-keys";
import { wsQueryOptions } from "@/api/query/computer-query-options";
import type { ComputerQueryScope } from "@/api/query/query-scope";
import { gitApi, type GitStatusResponse, type GitChangedFilesResponse, type GitFileDiffResponse, type GitChangedFile } from "@/api/ws-api";

export type { GitCompareParams, GitFileDiffParams };
export { GIT_WORKTREE_PARAMS };

type ConnectionState = "connecting" | "connected" | "disconnected" | "reconnecting";

/**
 * Compare-mode responses put every compared path into staged/unstaged/untracked
 * buckets. Consumers must concatenate when `compare_ref` is present (legacy store behavior).
 */
export const EMPTY_CHANGED_FILES: GitChangedFile[] = [];

export function selectCompareChangedFiles(
  response: GitChangedFilesResponse | undefined | null,
): { files: GitChangedFile[]; compareRef: string | null } {
  if (!response?.compare_ref) {
    return { files: EMPTY_CHANGED_FILES, compareRef: null };
  }
  return {
    files: [
      ...response.staged_files,
      ...response.unstaged_files,
      ...response.untracked_files,
    ],
    compareRef: response.compare_ref,
  };
}

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
    staleTime: 15_000,
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
    staleTime: 15_000,
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
    enabled: options?.enabled,
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
    staleTime: 60_000,
  });
}
