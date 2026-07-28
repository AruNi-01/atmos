"use client";

import { useComputerQueryScope, getComputerQueryScope } from "@/api/query/query-scope";
import { useWebSocketStore } from "@/features/connection/hooks/use-websocket";
import {
  gitChangedFilesQueryOptions,
  GIT_WORKTREE_PARAMS,
  type GitCompareParams,
} from "@/features/git/lib/git-query-options";

export { GIT_WORKTREE_PARAMS };
export type { GitCompareParams };
import { getAtmosWebQueryClient } from "@/providers/app/query-client";
import { forceRefetchActiveQueries } from "@/api/query/force-refetch";
import { queryKeys } from "@/api/query/query-keys";
import type { GitChangedFilesResponse } from "@/api/ws-api";
import { useSessionListQuery } from "@/features/workspace/hooks/use-session-list-query";
import {
  sessionListKeys,
  serializeGitCompareParams,
  useSessionListSnapshotStore,
} from "@/features/workspace/store/session-list-snapshot-store";

/**
 * React hook: changed-files snapshot for a repo path and compare params.
 * Session snapshot seeds paint across workspace hops.
 */
export function useGitChangedFilesQuery(
  repoPath: string | null | undefined,
  params: GitCompareParams = GIT_WORKTREE_PARAMS,
) {
  const scope = useComputerQueryScope();
  const connectionState = useWebSocketStore((s) => s.connectionState);
  const key = repoPath
    ? sessionListKeys.gitChangedFiles(repoPath, serializeGitCompareParams(params))
    : null;

  return useSessionListQuery(
    key,
    gitChangedFilesQueryOptions(scope, connectionState, repoPath ?? "", params, {
      enabled: Boolean(repoPath),
    }),
  );
}

/**
 * Soft invalidation after mutations / remote events: mark git queries stale and
 * refetch active observers. Prefer this when the user did not click Refresh.
 */
export async function invalidateGitQueries(repoPath: string): Promise<void> {
  try {
    const client = getAtmosWebQueryClient();
    const scope = getComputerQueryScope();
    await client.invalidateQueries({
      queryKey: queryKeys.computer.git(scope, repoPath),
    });
  } catch {
    // ignore outside browser / before provider mounts
  }
}

/**
 * User clicked Refresh on Changes: force active git queries to re-run queryFn.
 * Entering the Changes tab still paints from Query + session-list cache.
 */
export async function forceRefreshGitQueries(repoPath: string): Promise<void> {
  try {
    const client = getAtmosWebQueryClient();
    const scope = getComputerQueryScope();
    await forceRefetchActiveQueries(queryKeys.computer.git(scope, repoPath), client);
  } catch {
    // ignore outside browser / before provider mounts
  }
}

/** Snapshot getter: session store first, then Query cache. */
export function getGitChangedFilesSnapshot(
  repoPath: string,
  params: GitCompareParams = GIT_WORKTREE_PARAMS,
): GitChangedFilesResponse | undefined {
  const sessionKey = sessionListKeys.gitChangedFiles(
    repoPath,
    serializeGitCompareParams(params),
  );
  const fromSession = useSessionListSnapshotStore
    .getState()
    .get<GitChangedFilesResponse>(sessionKey);
  if (fromSession) return fromSession;
  try {
    const client = getAtmosWebQueryClient();
    const scope = getComputerQueryScope();
    return client.getQueryData<GitChangedFilesResponse>(
      queryKeys.computer.gitChangedFiles(scope, repoPath, params),
    );
  } catch {
    return undefined;
  }
}
