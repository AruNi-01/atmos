"use client";

import { useQuery } from "@tanstack/react-query";
import { useComputerQueryScope } from "@/api/query/query-scope";
import { useWebSocketStore } from "@/features/connection/hooks/use-websocket";
import { gitFileDiffQueryOptions, type GitFileDiffParams } from "@/features/git/lib/git-query-options";
import type { GitFileDiffResponse } from "@/api/ws-api";

const WORKTREE_DIFF_PARAMS: GitFileDiffParams = {
  baseBranch: null,
  againstIndex: false,
  baseRef: null,
  commitRef: null,
};

/**
 * React hook: cached single-file diff for a repo path and file path.
 *
 * Disabled when repoPath or filePath is null/empty.
 */
export function useGitFileDiffQuery(
  repoPath: string | null | undefined,
  filePath: string | null | undefined,
  params: GitFileDiffParams = WORKTREE_DIFF_PARAMS,
) {
  const scope = useComputerQueryScope();
  const connectionState = useWebSocketStore((s) => s.connectionState);
  const enabled = Boolean(repoPath) && Boolean(filePath) && connectionState === "connected" && Boolean(scope.activeInstanceId);

  return useQuery(
    repoPath && filePath
      ? {
          ...gitFileDiffQueryOptions(scope, connectionState, repoPath, filePath, params),
          enabled,
        }
      : {
          queryKey: ["disabled"],
          queryFn: () => null as unknown as GitFileDiffResponse,
          enabled: false,
        },
  );
}
