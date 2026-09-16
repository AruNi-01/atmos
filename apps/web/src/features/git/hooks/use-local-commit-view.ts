"use client";

import { useQuery } from "@tanstack/react-query";
import { useComputerQueryScope } from "@/api/query/query-scope";
import { queryKeys } from "@/api/query/query-keys";
import { wsQueryOptions } from "@/api/query/computer-query-options";
import { useWebSocketStore } from "@/features/connection/hooks/use-websocket";
import { loadLocalCommitView } from "@/features/git/lib/local-commit-view";

export function useLocalCommitView(
  repoPath: string | null | undefined,
  sha: string,
  enabled = true,
) {
  const scope = useComputerQueryScope();
  const connectionState = useWebSocketStore((s) => s.connectionState);
  const path = repoPath ?? "";
  return useQuery(
    wsQueryOptions({
      scope,
      connectionState,
      enabled: enabled && Boolean(path && sha),
      queryKey: queryKeys.computer.gitLocalCommit(scope, path, sha),
      queryFn: () => loadLocalCommitView(path, sha),
    }),
  );
}
