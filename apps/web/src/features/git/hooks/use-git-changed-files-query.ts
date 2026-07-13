"use client";

import { useQuery } from "@tanstack/react-query";
import { useComputerQueryScope, getComputerQueryScope } from "@/api/query/query-scope";
import { useWebSocketStore } from "@/features/connection/hooks/use-websocket";
import {
  gitChangedFilesQueryOptions,
  GIT_WORKTREE_PARAMS,
  type GitCompareParams,
} from "@/features/git/lib/git-query-options";
import { getAtmosWebQueryClient } from "@/providers/app/query-client";
import { queryKeys } from "@/api/query/query-keys";
import type { GitChangedFilesResponse } from "@/api/ws-api";

/**
 * React hook: cached changed-files snapshot for a repo path and compare params.
 *
 * Pass no params (or GIT_WORKTREE_PARAMS) for the worktree view (staged/unstaged/untracked).
 * Pass compare params for a compare-against-ref view.
 */
export function useGitChangedFilesQuery(
  repoPath: string | null | undefined,
  params: GitCompareParams = GIT_WORKTREE_PARAMS,
) {
  const scope = useComputerQueryScope();
  const connectionState = useWebSocketStore((s) => s.connectionState);

  return useQuery(
    repoPath
      ? {
          ...gitChangedFilesQueryOptions(scope, connectionState, repoPath, params),
          enabled: connectionState === "connected" && Boolean(scope.activeInstanceId),
        }
      : {
          queryKey: ["disabled"],
          queryFn: () => null as unknown as GitChangedFilesResponse,
          enabled: false,
        },
  );
}

/** Imperative invalidation: invalidates all git queries under the given repo path. */
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

/** Snapshot getter without mounting a hook. */
export function getGitChangedFilesSnapshot(
  repoPath: string,
  params: GitCompareParams = GIT_WORKTREE_PARAMS,
): GitChangedFilesResponse | undefined {
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
