import { useCallback, useMemo, useRef } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { wsActions } from "@/api/ws-actions";
import { useMobileWs } from "@/providers/MobileWsProvider";
import { useSessionStore } from "@/stores/session-store";

/**
 * Global agent-session pages, newest first. Workspace and Session share this
 * cache. A state list is a filter over these pages, so a screen that is still
 * at the bottom has to request the next page or later rows of that state stay
 * on the server.
 */
export function useAgentSessionStatusList() {
  const { client, state: wsState } = useMobileWs();
  const hasDeviceCredential = useSessionStore((state) => state.hasDeviceCredential);
  const selectedServerId = useSessionStore((state) => state.selectedServerId);
  const connected = hasDeviceCredential && wsState === "open";

  const query = useInfiniteQuery({
    queryKey: ["agent-session-status-list", selectedServerId],
    enabled: Boolean(client && connected),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => {
      if (!client) return Promise.reject(new Error("Atmos mobile WebSocket is not connected"));
      return wsActions.agentSessionStatusList(client, pageParam);
    },
    getNextPageParam: (lastPage) => {
      const cursor = lastPage.next_cursor?.trim() ?? "";
      return cursor.length > 0 ? cursor : undefined;
    },
  });

  const nextPageLock = useRef(false);
  const loadNextPage = useCallback((allowError: boolean) => {
    if (nextPageLock.current || !query.hasNextPage || query.isFetchingNextPage) return;
    if (!allowError && query.isFetchNextPageError) return;
    nextPageLock.current = true;
    void query.fetchNextPage().finally(() => {
      nextPageLock.current = false;
    });
  }, [query.fetchNextPage, query.hasNextPage, query.isFetchNextPageError, query.isFetchingNextPage]);

  const fetchNextPage = useCallback(() => {
    loadNextPage(false);
  }, [loadNextPage]);

  const retryNextPage = useCallback(() => {
    loadNextPage(true);
  }, [loadNextPage]);

  const pages = query.data?.pages;
  const sessions = useMemo(
    () => pages?.flatMap((page) => page.sessions) ?? [],
    [pages],
  );

  return {
    counts: pages?.[0]?.counts,
    error: query.error,
    fetchNextPage,
    hasNextPage: Boolean(query.hasNextPage),
    isFetchNextPageError: query.isFetchNextPageError,
    isFetchingNextPage: query.isFetchingNextPage,
    isLoading: query.isLoading,
    pageCount: pages?.length ?? 0,
    retryNextPage,
    sessions,
  };
}
