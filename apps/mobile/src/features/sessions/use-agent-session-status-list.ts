import { useCallback, useMemo, useRef } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { wsActions } from "@/api/ws-actions";
import { useMobileWs } from "@/providers/MobileWsProvider";
import { useSessionStore } from "@/stores/session-store";
import { agentSessionStatusListInput, agentSessionStatusQueryKey } from "./session-status-page";

export type AgentSessionStatusListOptions = {
  /** False skips the fetch and does not flatten a warm cache. */
  enabled?: boolean;
  groupKey?: string | null;
  contextId?: string | null;
  limit?: number | null;
};

/**
 * Agent-session pages, newest first. The unfiltered key is shared by the
 * session home and row actions. A bucket or workspace passes `groupKey` /
 * `contextId` and gets its own page instead of filtering the global cache.
 */
export function useAgentSessionStatusList(options: AgentSessionStatusListOptions = {}) {
  const enabled = options.enabled !== false;
  const { client, state: wsState } = useMobileWs();
  const hasDeviceCredential = useSessionStore((state) => state.hasDeviceCredential);
  const selectedServerId = useSessionStore((state) => state.selectedServerId);
  const connected = hasDeviceCredential && wsState === "open";
  const groupKey = options.groupKey;
  const contextId = options.contextId;
  const limit = options.limit;

  const query = useInfiniteQuery({
    queryKey: agentSessionStatusQueryKey({
      serverId: selectedServerId,
      groupKey,
      contextId,
      limit,
    }),
    enabled: Boolean(client && connected && enabled),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => {
      if (!client) return Promise.reject(new Error("Atmos mobile WebSocket is not connected"));
      return wsActions.agentSessionStatusList(
        client,
        agentSessionStatusListInput({
          cursor: pageParam,
          groupKey,
          contextId,
          limit,
        }),
      );
    },
    getNextPageParam: (lastPage) => {
      const cursor = lastPage.next_cursor?.trim() ?? "";
      return cursor.length > 0 ? cursor : undefined;
    },
  });

  const nextPageLock = useRef(false);
  const loadNextPage = useCallback(
    (allowError: boolean) => {
      if (!enabled || nextPageLock.current || !query.hasNextPage || query.isFetchingNextPage)
        return;
      if (!allowError && query.isFetchNextPageError) return;
      nextPageLock.current = true;
      void query.fetchNextPage().finally(() => {
        nextPageLock.current = false;
      });
    },
    [
      enabled,
      query.fetchNextPage,
      query.hasNextPage,
      query.isFetchNextPageError,
      query.isFetchingNextPage,
    ],
  );

  const fetchNextPage = useCallback(() => {
    loadNextPage(false);
  }, [loadNextPage]);

  const retryNextPage = useCallback(() => {
    loadNextPage(true);
  }, [loadNextPage]);

  const pages = enabled ? query.data?.pages : undefined;
  const sessions = useMemo(() => pages?.flatMap((page) => page.sessions) ?? [], [pages]);

  return {
    counts: pages?.[0]?.counts,
    error: enabled ? query.error : null,
    fetchNextPage,
    hasNextPage: enabled && Boolean(query.hasNextPage),
    isFetchNextPageError: enabled && query.isFetchNextPageError,
    isFetchingNextPage: enabled && query.isFetchingNextPage,
    isLoading: !enabled || query.isLoading,
    pageCount: pages?.length ?? 0,
    retryNextPage,
    sessions,
  };
}
