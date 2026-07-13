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
    repoPath
      ? {
          ...gitBranchesQueryOptions(scope, connectionState, repoPath),
          enabled: connectionState === "connected" && Boolean(scope.activeInstanceId),
        }
      : {
          queryKey: ["disabled"],
          queryFn: () => null as unknown as { local: string[]; remote: string[] },
          enabled: false,
        },
  );
}
