"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AgentSessionStatusSnapshot } from "@atmos/api-types/ws/dto/agent-status";
import { useComputerQueryScope } from "@/api/query/query-scope";
import { isComputerQueryScopeCurrent, wsRequest } from "@/api/ws/request";
import { useAgentChatCenterTabsStore } from "@/features/agent/store/use-agent-chat-center-tabs";
import { useWebSocketStore } from "@/features/connection/hooks/use-websocket";

const SESSION_PAGE_SIZE = 100;

export function useSidebarAgentSessions(enabled: boolean) {
  const [snapshots, setSnapshots] = useState<AgentSessionStatusSnapshot[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const scope = useComputerQueryScope();
  const generation = useRef(0);
  const loadingMore = useRef(false);
  const tabsByContext = useAgentChatCenterTabsStore((state) => state.tabsByContext);

  useEffect(() => {
    setSnapshots([]);
    setNextCursor(null);
    setLoaded(false);
  }, [scope]);

  const reload = useCallback(async () => {
    if (!enabled) return;
    const ticket = generation.current + 1;
    generation.current = ticket;
    const expected = scope;
    try {
      const response = await wsRequest("agent_session_status_list", {
        limit: SESSION_PAGE_SIZE,
        cursor: null,
      });
      if (ticket !== generation.current || !isComputerQueryScopeCurrent(expected)) return;
      setSnapshots(response.sessions ?? []);
      setNextCursor(response.next_cursor);
      setLoaded(true);
    } catch (error) {
      if (ticket !== generation.current) return;
      console.error("Failed to load agent session statuses:", error);
      setSnapshots([]);
      setNextCursor(null);
      setLoaded(true);
    }
  }, [enabled, scope]);

  const loadMore = useCallback(async () => {
    if (!enabled || !nextCursor || loadingMore.current) return;
    loadingMore.current = true;
    const ticket = generation.current;
    const expected = scope;
    try {
      const response = await wsRequest("agent_session_status_list", {
        limit: SESSION_PAGE_SIZE,
        cursor: nextCursor,
      });
      if (ticket !== generation.current || !isComputerQueryScopeCurrent(expected)) return;
      setSnapshots((current) => {
        const seen = new Set(current.map((session) => session.session_id));
        return [
          ...current,
          ...(response.sessions ?? []).filter((session) => !seen.has(session.session_id)),
        ];
      });
      setNextCursor(response.next_cursor);
    } catch (error) {
      if (ticket !== generation.current) return;
      console.error("Failed to load more agent sessions:", error);
    } finally {
      loadingMore.current = false;
    }
  }, [enabled, nextCursor, scope]);

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
    const unsubscribeTitle = useWebSocketStore
      .getState()
      .onEvent("terminal_title_updated", schedule);
    return () => {
      unsubscribeChanged();
      unsubscribeCleared();
      unsubscribeRaised();
      unsubscribeAttentionCleared();
      unsubscribeTitle();
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
    return titles;
  }, [tabsByContext]);

  const archiveSession = useCallback(
    async (sessionId: string) => {
      await wsRequest("agent_session_archive", { session_id: sessionId });
      setSnapshots((current) => current.filter((session) => session.session_id !== sessionId));
      await reload();
    },
    [reload],
  );

  return { archiveSession, hasMore: Boolean(nextCursor), loadMore, snapshots, chatTitles, loaded };
}
