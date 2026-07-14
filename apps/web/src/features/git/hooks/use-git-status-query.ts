"use client";

import { useQuery } from "@tanstack/react-query";
import { useComputerQueryScope, getComputerQueryScope } from "@/api/query/query-scope";
import { useWebSocketStore } from "@/features/connection/hooks/use-websocket";
import { gitStatusQueryOptions } from "@/features/git/lib/git-query-options";
import { getAtmosWebQueryClient } from "@/providers/app/query-client";
import type { GitStatusResponse } from "@/api/ws-api";

/**
 * React hook: cached git status for a repo path.
 * Returns undefined data when repoPath is null/empty or WebSocket is not connected.
 */
export function useGitStatusQuery(repoPath: string | null | undefined) {
  const scope = useComputerQueryScope();
  const connectionState = useWebSocketStore((s) => s.connectionState);

  return useQuery(
    gitStatusQueryOptions(scope, connectionState, repoPath ?? "", {
      enabled: Boolean(repoPath),
    }),
  );
}

/** Imperative getter: returns cached status without mounting a hook. */
export function getGitStatusSnapshot(repoPath: string): GitStatusResponse | undefined {
  try {
    const client = getAtmosWebQueryClient();
    const scope = getComputerQueryScope();
    return client.getQueryData<GitStatusResponse>(
      gitStatusQueryOptions(scope, "connected", repoPath).queryKey,
    );
  } catch {
    return undefined;
  }
}
