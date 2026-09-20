"use client";

import { useQuery } from "@tanstack/react-query";
import { useComputerQueryScope } from "@/api/query/query-scope";
import { useWebSocketStore } from "@/features/connection/hooks/use-websocket";
import { gitCommitDetailQueryOptions } from "@/features/git/lib/git-query-options";

export function useGitCommitDetailQuery(
  repoPath: string | null | undefined,
  commitHash: string | null | undefined,
  options?: { enabled?: boolean },
) {
  const scope = useComputerQueryScope();
  const connectionState = useWebSocketStore((s) => s.connectionState);
  const sha = commitHash ?? "";

  return useQuery(
    gitCommitDetailQueryOptions(scope, connectionState, repoPath ?? "", sha, {
      enabled: (options?.enabled ?? true) && Boolean(repoPath) && Boolean(sha),
    }),
  );
}
