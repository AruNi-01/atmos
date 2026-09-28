import { useCallback, useRef } from "react";
import { useQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import type { AgentSessionStatusListResponse } from "@atmos/api-types/ws/dto/agent-status";
import { wsActions } from "@/api/ws-actions";
import { useMobileWs } from "@/providers/MobileWsProvider";
import { useSessionStore } from "@/stores/session-store";
import {
  parseArchivedSessionIds,
  parsePinnedSessionIds,
  sessionDeleteFlags,
  type SessionDeleteChoice,
} from "./session-row-actions";

export function useSessionRowActions() {
  const { client, state } = useMobileWs();
  const connected = Boolean(client && state === "open");
  const selectedServerId = useSessionStore((store) => store.selectedServerId);
  const queryClient = useQueryClient();
  const settingsKey = ["workspace-sidebar-sessions", selectedServerId] as const;
  const statusKey = ["agent-session-status-list", selectedServerId] as const;
  const settingsQuery = useQuery({
    queryKey: settingsKey,
    enabled: connected,
    queryFn: async () => {
      const settings = await wsActions.functionSettingsGet(client!);
      return {
        archivedIds: parseArchivedSessionIds(settings),
        pinnedIds: parsePinnedSessionIds(settings),
      };
    },
  });
  const archivedIds = settingsQuery.data?.archivedIds ?? [];
  const pinnedIds = settingsQuery.data?.pinnedIds ?? [];
  const settingsRef = useRef({ archivedIds, pinnedIds });
  settingsRef.current = { archivedIds, pinnedIds };
  const writeChain = useRef(Promise.resolve());

  const writeIds = useCallback(
    (key: "archived_session_ids" | "pinned_session_ids", next: string[], previous: string[]) => {
      if (!client || !connected) return;
      writeChain.current = writeChain.current
        .catch(() => undefined)
        .then(async () => {
          await wsActions.functionSettingsUpdate(client, "workspace_sidebar", key, next);
        })
        .catch(() => {
          const field = key === "pinned_session_ids" ? "pinnedIds" : "archivedIds";
          if (settingsRef.current[field].join("\n") !== next.join("\n")) return;
          settingsRef.current = { ...settingsRef.current, [field]: previous };
          queryClient.setQueryData(settingsKey, (current: { archivedIds: string[]; pinnedIds: string[] } | undefined) => {
            if (!current) return current;
            return { ...current, [field]: previous };
          });
        });
    },
    [client, connected, queryClient, selectedServerId],
  );

  const togglePin = useCallback(
    (sessionId: string) => {
      const current = settingsRef.current.pinnedIds;
      const next = current.includes(sessionId)
        ? current.filter((id) => id !== sessionId)
        : [sessionId, ...current];
      settingsRef.current = { ...settingsRef.current, pinnedIds: next };
      queryClient.setQueryData(settingsKey, (value: { archivedIds: string[]; pinnedIds: string[] } | undefined) => ({
        archivedIds: value?.archivedIds ?? settingsRef.current.archivedIds,
        pinnedIds: next,
      }));
      writeIds("pinned_session_ids", next, current);
    },
    [queryClient, selectedServerId, writeIds],
  );

  const rememberArchived = useCallback(
    (ids: string[]) => {
      const current = settingsRef.current.archivedIds;
      const next = [...current];
      for (const id of ids) {
        if (id && !next.includes(id)) next.push(id);
      }
      if (next.length === current.length) return;
      settingsRef.current = { ...settingsRef.current, archivedIds: next };
      queryClient.setQueryData(settingsKey, (value: { archivedIds: string[]; pinnedIds: string[] } | undefined) => ({
        archivedIds: next,
        pinnedIds: value?.pinnedIds ?? settingsRef.current.pinnedIds,
      }));
      writeIds("archived_session_ids", next, current);
    },
    [queryClient, selectedServerId, writeIds],
  );

  const hideSession = useCallback(
    (sessionId: string) => {
      queryClient.setQueryData<InfiniteData<AgentSessionStatusListResponse>>(statusKey, (current) => {
        if (!current?.pages) return current;
        return {
          ...current,
          pages: current.pages.map((page) => ({
            ...page,
            sessions: page.sessions.filter((session) => session.session_id !== sessionId),
          })),
        };
      });
    },
    [queryClient, selectedServerId],
  );

  const archiveChat = useCallback(
    async (sessionId: string, chatId: string) => {
      if (!client || !connected) return;
      const { keys } = await wsActions.hostSessionKeysForChat(client, chatId);
      if (keys.length > 0) {
        await wsActions.hostSessionSetArchived(client, keys, true);
      }
      await wsActions.agentSessionArchive(client, sessionId);
      hideSession(sessionId);
      rememberArchived([sessionId, chatId]);
      void queryClient.invalidateQueries({ queryKey: statusKey });
    },
    [client, connected, hideSession, queryClient, rememberArchived, selectedServerId],
  );

  const deleteChat = useCallback(
    async (sessionId: string, chatId: string, choice: SessionDeleteChoice) => {
      if (!client || !connected) return;
      const flags = sessionDeleteFlags(choice);
      const { keys } = await wsActions.hostSessionKeysForChat(client, chatId);
      if (keys.length > 0) {
        await wsActions.hostSessionDelete(client, { keys, ...flags });
      } else if (flags.include_atmos_chat) {
        await wsActions.agentChatDelete(client, { chat_id: chatId });
      }
      await wsActions.agentSessionArchive(client, sessionId);
      hideSession(sessionId);
      rememberArchived([sessionId, chatId]);
      void queryClient.invalidateQueries({ queryKey: statusKey });
    },
    [client, connected, hideSession, queryClient, rememberArchived, selectedServerId],
  );

  return { archiveChat, archivedIds, deleteChat, pinnedIds, togglePin };
}
