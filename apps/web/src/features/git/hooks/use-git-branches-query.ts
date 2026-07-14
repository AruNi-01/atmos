"use client";

import { useQuery } from "@tanstack/react-query";
import { useComputerQueryScope } from "@/api/query/query-scope";
import { useWebSocketStore } from "@/features/connection/hooks/use-websocket";
import { gitBranchesQueryOptions } from "@/features/git/lib/git-query-options";

/**
 * React hook: cached local + remote branch list for a repo path.
 */
export function useGitBranchesQuery(repoPath: string | null | undefined) {
  const scope = useComputerQueryScope();
  const connectionState = useWebSocketStore((s) => s.connectionState);

  return useQuery(
    gitBranchesQueryOptions(scope, connectionState, repoPath ?? "", {
      enabled: Boolean(repoPath),
    }),
  );
}
