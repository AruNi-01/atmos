"use client";

import { useComputerQueryScope } from "@/api/query/query-scope";
import { useWebSocketStore } from "@/features/connection/hooks/use-websocket";
import { gitBranchesQueryOptions } from "@/features/git/lib/git-query-options";
import { useSessionListQuery } from "@/features/workspace/hooks/use-session-list-query";
import { sessionListKeys } from "@/features/workspace/store/session-list-snapshot-store";

/**
 * React hook: cached local + remote branch list for a repo path.
 * Session snapshot keeps the list across long idle hops.
 */
export function useGitBranchesQuery(repoPath: string | null | undefined) {
  const scope = useComputerQueryScope();
  const connectionState = useWebSocketStore((s) => s.connectionState);
  const key = repoPath ? sessionListKeys.gitBranches(repoPath) : null;

  return useSessionListQuery(
    key,
    gitBranchesQueryOptions(scope, connectionState, repoPath ?? "", {
      enabled: Boolean(repoPath),
    }),
  );
}
