import { useCallback } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import type {
  AgentChatIndexEntry,
  AgentChatListResponse,
} from "@atmos/api-types/ws/dto/agent-chat";
import { wsActions } from "@/api/ws-actions";
import { useMobileWs } from "@/providers/MobileWsProvider";
import { useSessionStore } from "@/stores/session-store";
import { CHAT_LIST_PAGE_SIZE, nextChatListCursor } from "./chat-list-page";
import { toChatListRows } from "./list-rows";
import { resolveChatScope } from "./scope";

function errorText(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export type AgentChatListOptions = {
  /** False skips the fetch and does not flatten a warm cache. */
  enabled?: boolean;
  /** Defaults to `CHAT_LIST_PAGE_SIZE` (100) so title lookup still sees older chats. */
  pageSize?: number;
};

export function useAgentChatList(scopeId: string, options: AgentChatListOptions = {}) {
  const enabled = options.enabled !== false;
  const pageSize = options.pageSize ?? CHAT_LIST_PAGE_SIZE;
  const { client, state: wsState } = useMobileWs();
  const connected = Boolean(client && wsState === "open");
  const selectedServerId = useSessionStore((state) => state.selectedServerId);
  const bootstrapQuery = useQuery({
    queryKey: ["workspace-bootstrap", selectedServerId, wsState],
    enabled: Boolean(enabled && client && wsState === "open"),
    queryFn: () => wsActions.projectWorkspaceBootstrap(client!),
  });
  const scopeResult =
    enabled && bootstrapQuery.data ? resolveChatScope(bootstrapQuery.data, scopeId) : null;
  const listQuery = useInfiniteQuery({
    queryKey: ["agent-chat-list", selectedServerId, scopeId, wsState, pageSize],
    enabled: Boolean(enabled && client && wsState === "open" && scopeResult?.ok),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => {
      if (!client || !scopeResult?.ok) {
        return Promise.reject(new Error("Chat scope is not ready."));
      }
      return wsActions.agentChatList(client, {
        ...scopeResult.scope,
        cursor: pageParam,
        limit: pageSize,
      }) as Promise<AgentChatListResponse>;
    },
    getNextPageParam: (lastPage, _pages, lastPageParam) =>
      nextChatListCursor(lastPage.items ?? [], pageSize, lastPageParam),
  });
  const fetchNextPage = useCallback(() => {
    if (!listQuery.hasNextPage || listQuery.isFetchingNextPage || listQuery.isFetchNextPageError)
      return;
    void listQuery.fetchNextPage();
  }, [
    listQuery.fetchNextPage,
    listQuery.hasNextPage,
    listQuery.isFetchNextPageError,
    listQuery.isFetchingNextPage,
  ]);
  const retryNextPage = useCallback(() => {
    if (!listQuery.hasNextPage || listQuery.isFetchingNextPage) return;
    void listQuery.fetchNextPage();
  }, [listQuery.fetchNextPage, listQuery.hasNextPage, listQuery.isFetchingNextPage]);
  const chatItems = enabled
    ? uniqueChatItems(listQuery.data?.pages.flatMap((page) => page.items ?? []) ?? [])
    : [];

  const loading =
    !enabled ||
    (connected && (bootstrapQuery.isLoading || Boolean(scopeResult?.ok && listQuery.isLoading)));
  const initialError = enabled && !listQuery.isFetchNextPageError ? listQuery.error : null;
  const error = !enabled
    ? null
    : connected
      ? bootstrapQuery.error
        ? errorText(bootstrapQuery.error, "Could not load chats.")
        : scopeResult && !scopeResult.ok
          ? scopeResult.error
          : initialError
            ? errorText(initialError, "Could not load chats.")
            : null
      : "Atmos mobile WebSocket is not connected";

  return {
    rows: enabled ? toChatListRows(chatItems) : [],
    loading,
    error,
    refetch: listQuery.refetch,
    fetchNextPage,
    retryNextPage,
    hasNextPage: enabled && Boolean(listQuery.hasNextPage),
    isFetchingNextPage: enabled && listQuery.isFetchingNextPage,
    isFetchNextPageError: enabled && listQuery.isFetchNextPageError,
    pageCount: enabled ? (listQuery.data?.pages.length ?? 0) : 0,
  };
}

function uniqueChatItems(items: AgentChatIndexEntry[]): AgentChatIndexEntry[] {
  const seen = new Set<string>();
  const unique: AgentChatIndexEntry[] = [];
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    unique.push(item);
  }
  return unique;
}
