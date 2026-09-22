"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AgentSessionStatusSnapshot } from "@atmos/api-types/ws/dto/agent-status";
import { useComputerQueryScope } from "@/api/query/query-scope";
import { isComputerQueryScopeCurrent, wsRequest } from "@/api/ws/request";
import { agentChatApi } from "@/api/ws/agent-chat-api";
import { useAgentChatCenterTabsStore } from "@/features/agent/store/use-agent-chat-center-tabs";
import { useWebSocketStore } from "@/features/connection/hooks/use-websocket";

const CHAT_TITLE_PAGE_LIMIT = 200;

export function useSidebarAgentSessions(loadChatTitles: boolean) {
  const [snapshots, setSnapshots] = useState<AgentSessionStatusSnapshot[]>([]);
  const [listedTitles, setListedTitles] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState(false);
  const scope = useComputerQueryScope();
  const generation = useRef(0);
  const tabsByContext = useAgentChatCenterTabsStore((state) => state.tabsByContext);

  const reload = useCallback(async () => {
    const ticket = generation.current + 1;
    generation.current = ticket;
    const expected = scope;
    try {
      const response = await wsRequest("agent_session_status_list", {});
      if (ticket !== generation.current || !isComputerQueryScopeCurrent(expected)) return;
      const sessions = response.sessions ?? [];
      setSnapshots(sessions);
      setLoaded(true);

      if (!loadChatTitles || !sessions.some((session) => session.surface === "chat")) return;
      const listed = await agentChatApi.list({
        all: true,
        limit: CHAT_TITLE_PAGE_LIMIT,
      });
      if (ticket !== generation.current || !isComputerQueryScopeCurrent(expected)) return;
      const titles: Record<string, string> = {};
      for (const item of listed.items ?? []) {
        const title = item.title?.trim();
        if (item.deleted || !title) continue;
        titles[item.id] = title;
      }
      setListedTitles(titles);
    } catch (error) {
      if (ticket !== generation.current) return;
      console.error("Failed to load agent session statuses:", error);
      setLoaded(true);
    }
  }, [loadChatTitles, scope]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    let timer: number | null = null;
    const schedule = () => {
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        timer = null;
        void reload();
      }, 150);
    };
    const unsubscribeChanged = useWebSocketStore
      .getState()
      .onEvent("agent_status_changed", schedule);
    const unsubscribeCleared = useWebSocketStore
      .getState()
      .onEvent("agent_status_cleared", schedule);
    const unsubscribeRaised = useWebSocketStore
      .getState()
      .onEvent("agent_attention_raised", schedule);
    const unsubscribeAttentionCleared = useWebSocketStore
      .getState()
      .onEvent("agent_attention_cleared", schedule);
    return () => {
      unsubscribeChanged();
      unsubscribeCleared();
      unsubscribeRaised();
      unsubscribeAttentionCleared();
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [reload]);

  const chatTitles = useMemo(() => {
    const titles: Record<string, string> = {};
    for (const tabs of Object.values(tabsByContext)) {
      for (const tab of tabs) {
        const title = tab.title.trim();
        if (tab.chatId && title) titles[tab.chatId] = title;
      }
    }
    return { ...titles, ...listedTitles };
  }, [listedTitles, tabsByContext]);

  const archiveSession = useCallback(
    async (sessionId: string) => {
      await wsRequest("agent_session_archive", { session_id: sessionId });
      await reload();
    },
    [reload],
  );

  return { archiveSession, snapshots, chatTitles, loaded };
}
