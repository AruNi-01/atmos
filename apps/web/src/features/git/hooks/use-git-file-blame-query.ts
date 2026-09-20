"use client";

import { useQuery } from "@tanstack/react-query";
import { useComputerQueryScope } from "@/api/query/query-scope";
import { useWebSocketStore } from "@/features/connection/hooks/use-websocket";
import { gitFileBlameQueryOptions } from "@/features/git/lib/git-query-options";

export function useGitFileBlameQuery(
  repoPath: string | null | undefined,
  filePath: string | null | undefined,
  options?: { enabled?: boolean },
) {
  const scope = useComputerQueryScope();
  const connectionState = useWebSocketStore((s) => s.connectionState);

  return useQuery(
    gitFileBlameQueryOptions(scope, connectionState, repoPath ?? "", filePath ?? "", {
      enabled: (options?.enabled ?? true) && Boolean(repoPath) && Boolean(filePath),
    }),
  );
}
