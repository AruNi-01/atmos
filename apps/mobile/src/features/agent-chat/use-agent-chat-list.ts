import { useQuery } from "@tanstack/react-query";
import type { AgentChatIndexEntry } from "@atmos/api-types/ws/dto/agent-chat";
import type { MobileWsClient } from "@/api/mobile-ws-client";
import { wsActions } from "@/api/ws-actions";
import { useMobileWs } from "@/providers/MobileWsProvider";
import { useSessionStore } from "@/stores/session-store";
import { toChatListRows } from "./list-rows";
import { resolveChatScope, type ChatScope } from "./scope";

const PAGE_SIZE = 100;
const MAX_PAGES = 20;

async function listChats(client: MobileWsClient, scope: ChatScope): Promise<AgentChatIndexEntry[]> {
  const items: AgentChatIndexEntry[] = [];
  const seen = new Set<string>();
  let cursor: string | null = null;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const response = await wsActions.agentChatList(client, {
      ...scope,
      cursor,
      limit: PAGE_SIZE,
    });
    const batch = response.items ?? [];
    for (const item of batch) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      items.push(item);
    }
    if (batch.length < PAGE_SIZE) break;
    const lastId = batch[batch.length - 1]?.id ?? null;
    if (!lastId || lastId === cursor) break;
    cursor = lastId;
  }
  return items;
}

function errorText(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function useAgentChatList(scopeId: string) {
  const { client, state: wsState } = useMobileWs();
  const connected = Boolean(client && wsState === "open");
  const selectedServerId = useSessionStore((state) => state.selectedServerId);
  const bootstrapQuery = useQuery({
    queryKey: ["workspace-bootstrap", selectedServerId, wsState],
    enabled: Boolean(client && wsState === "open"),
    queryFn: () => wsActions.projectWorkspaceBootstrap(client!),
  });
  const scopeResult = bootstrapQuery.data ? resolveChatScope(bootstrapQuery.data, scopeId) : null;
  const listQuery = useQuery({
    queryKey: ["agent-chat-list", selectedServerId, scopeId, wsState],
    enabled: Boolean(client && wsState === "open" && scopeResult?.ok),
    queryFn: () => {
      if (!client || !scopeResult?.ok) {
        return Promise.reject(new Error("Chat scope is not ready."));
      }
      return listChats(client, scopeResult.scope);
    },
  });

  const loading = connected && (
    bootstrapQuery.isLoading || Boolean(scopeResult?.ok && listQuery.isLoading)
  );
  const error = connected
    ? bootstrapQuery.error
      ? errorText(bootstrapQuery.error, "Could not load chats.")
      : scopeResult && !scopeResult.ok
        ? scopeResult.error
        : listQuery.error
          ? errorText(listQuery.error, "Could not load chats.")
          : null
    : "Atmos mobile WebSocket is not connected";

  return {
    rows: toChatListRows(listQuery.data ?? []),
    loading,
    error,
    refetch: listQuery.refetch,
  };
}
