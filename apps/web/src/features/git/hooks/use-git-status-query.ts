"use client";

import { useComputerQueryScope, getComputerQueryScope } from "@/api/query/query-scope";
import { useWebSocketStore } from "@/features/connection/hooks/use-websocket";
import { gitStatusQueryOptions } from "@/features/git/lib/git-query-options";
import { getAtmosWebQueryClient } from "@/providers/app/query-client";
import type { GitStatusResponse } from "@/api/ws-api";
import { useSessionListQuery } from "@/features/workspace/hooks/use-session-list-query";
import {
  sessionListKeys,
  useSessionListSnapshotStore,
} from "@/features/workspace/store/session-list-snapshot-store";

/**
 * React hook: git status for a repo path.
 * Session snapshot seeds paint across workspace hops; Query owns fetch/dedupe.
 */
export function useGitStatusQuery(repoPath: string | null | undefined) {
  const scope = useComputerQueryScope();
  const connectionState = useWebSocketStore((s) => s.connectionState);
  const key = repoPath ? sessionListKeys.gitStatus(repoPath) : null;

  return useSessionListQuery(
    key,
    gitStatusQueryOptions(scope, connectionState, repoPath ?? "", {
      enabled: Boolean(repoPath),
    }),
  );
}

/** Imperative getter: session snapshot first, then Query cache. */
export function getGitStatusSnapshot(repoPath: string): GitStatusResponse | undefined {
  const fromSession = useSessionListSnapshotStore
    .getState()
    .get<GitStatusResponse>(sessionListKeys.gitStatus(repoPath));
  if (fromSession) return fromSession;
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
