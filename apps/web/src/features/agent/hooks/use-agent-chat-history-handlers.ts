"use client";

import {
  useCallback,
  useEffect,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import { agentApi as agentRestApi, type AgentChatSessionItem } from "@/api/rest-api";
import type { AgentPlan } from "@/features/agent/hooks/use-agent-session";
import type { ThreadEntry } from "@/features/agent/lib/agent/thread";
import type { AgentChatMode } from "@/features/agent/types/index";
import type { PendingPermission } from "../lib/chat-helpers";

interface UseAgentChatHistoryHandlersParams {
  autoResumeTriedRef: MutableRefObject<string | null>;
  canUseCurrentMode: boolean;
  chatMode: AgentChatMode;
  contextKey: string;
  disconnect: () => void;
  historyOpen: boolean;
  isConnected: boolean;
  isConnecting: boolean;
  isResumingHistory: boolean;
  resumeSession: (sessionId: string) => Promise<boolean>;
  sessionId: string | null;
  sessionProjectId: string | null;
  sessionWorkspaceId: string | null;
  setActiveSessionByContext: Dispatch<SetStateAction<Record<string, string>>>;
  setCurrentPlan: Dispatch<SetStateAction<AgentPlan | null>>;
  setEntries: Dispatch<SetStateAction<ThreadEntry[]>>;
  setHistoryCursor: Dispatch<SetStateAction<string | null>>;
  setHistoryHasMore: Dispatch<SetStateAction<boolean>>;
  setHistoryLoading: Dispatch<SetStateAction<boolean>>;
  setHistoryOpen: Dispatch<SetStateAction<boolean>>;
  setHistorySessions: Dispatch<SetStateAction<AgentChatSessionItem[]>>;
  setIsAutoGeneratingTitle: Dispatch<SetStateAction<boolean>>;
  setIsManualLoadingMessages: Dispatch<SetStateAction<boolean>>;
  setIsResumedSession: Dispatch<SetStateAction<boolean>>;
  setIsResumingHistory: Dispatch<SetStateAction<boolean>>;
  setPendingPermission: Dispatch<SetStateAction<PendingPermission | null>>;
  setRegistryId: Dispatch<SetStateAction<string>>;
  setSessionTitle: Dispatch<SetStateAction<string | null>>;
  setSessionTitleSource: Dispatch<SetStateAction<string | null>>;
  setShouldScrambleAutoTitle: Dispatch<SetStateAction<boolean>>;
  setWaitingForResponse: Dispatch<SetStateAction<boolean>>;
  skipNextAutoConnectRef: MutableRefObject<boolean>;
  stoppedRef: MutableRefObject<boolean>;
}

export function useAgentChatHistoryHandlers({
  autoResumeTriedRef,
  canUseCurrentMode,
  chatMode,
  contextKey,
  disconnect,
  historyOpen,
  isConnected,
  isConnecting,
  isResumingHistory,
  resumeSession,
  sessionId,
  sessionProjectId,
  sessionWorkspaceId,
  setActiveSessionByContext,
  setCurrentPlan,
  setEntries,
  setHistoryCursor,
  setHistoryHasMore,
  setHistoryLoading,
  setHistoryOpen,
  setHistorySessions,
  setIsAutoGeneratingTitle,
  setIsManualLoadingMessages,
  setIsResumedSession,
  setIsResumingHistory,
  setPendingPermission,
  setRegistryId,
  setSessionTitle,
  setSessionTitleSource,
  setShouldScrambleAutoTitle,
  setWaitingForResponse,
  skipNextAutoConnectRef,
  stoppedRef,
}: UseAgentChatHistoryHandlersParams) {
  const loadHistorySessions = useCallback(
    async (cursor?: string) => {
      setHistoryLoading(true);
      try {
        const contextType =
          sessionWorkspaceId != null ? "workspace" : sessionProjectId != null ? "project" : "temp";
        const contextGuid = sessionWorkspaceId ?? sessionProjectId ?? undefined;
        const res = await agentRestApi.listSessions({
          context_type: contextType,
          context_guid: contextGuid,
          mode: chatMode,
          limit: 20,
          cursor,
        });
        if (cursor) {
          setHistorySessions((prev) => [...prev, ...res.items]);
        } else {
          setHistorySessions(res.items);
        }
        setHistoryCursor(res.next_cursor);
        setHistoryHasMore(res.has_more);
      } catch {
        setHistorySessions([]);
      } finally {
        setHistoryLoading(false);
      }
    },
    [
      chatMode,
      sessionProjectId,
      sessionWorkspaceId,
      setHistoryCursor,
      setHistoryHasMore,
      setHistoryLoading,
      setHistorySessions,
    ],
  );

  useEffect(() => {
    if (!historyOpen) return;
    setHistorySessions([]);
    setHistoryCursor(null);
    loadHistorySessions();
  }, [historyOpen, loadHistorySessions, setHistoryCursor, setHistorySessions]);

  const handleSelectHistorySession = useCallback(
    async (session: AgentChatSessionItem) => {
      if (isConnecting || !canUseCurrentMode) return;
      if (sessionId === session.guid && isConnected) {
        setHistoryOpen(false);
        return;
      }
      setHistoryOpen(false);
      skipNextAutoConnectRef.current = true;
      disconnect();
      setEntries([]);
      setCurrentPlan(null);
      setPendingPermission(null);
      setWaitingForResponse(false);
      stoppedRef.current = false;
      setRegistryId(session.registry_id);
      setSessionTitle(session.title || null);
      setSessionTitleSource(session.title_source ?? null);
      setIsAutoGeneratingTitle(false);
      setShouldScrambleAutoTitle(false);
      setIsResumedSession(true);
      setActiveSessionByContext((prev) => ({ ...prev, [contextKey]: session.guid }));
      setIsResumingHistory(true);
      autoResumeTriedRef.current = null;
      try {
        const success = await resumeSession(session.guid);
        if (!success) {
          setIsResumingHistory(false);
        }
      } catch {
        setIsResumingHistory(false);
      } finally {
        skipNextAutoConnectRef.current = false;
      }
    },
    [
      autoResumeTriedRef,
      canUseCurrentMode,
      contextKey,
      disconnect,
      isConnected,
      isConnecting,
      resumeSession,
      sessionId,
      setActiveSessionByContext,
      setCurrentPlan,
      setEntries,
      setHistoryOpen,
      setIsAutoGeneratingTitle,
      setIsResumedSession,
      setIsResumingHistory,
      setPendingPermission,
      setRegistryId,
      setSessionTitle,
      setSessionTitleSource,
      setShouldScrambleAutoTitle,
      setWaitingForResponse,
      skipNextAutoConnectRef,
      stoppedRef,
    ],
  );

  const handleManualLoadMessages = useCallback(async () => {
    const targetSessionId = sessionId;
    if (!targetSessionId || isConnecting || isResumingHistory) return;

    setIsManualLoadingMessages(true);
    try {
      setIsResumingHistory(true);
      setIsResumedSession(true);
      skipNextAutoConnectRef.current = true;
      disconnect();
      setEntries([]);
      setCurrentPlan(null);
      setPendingPermission(null);
      const success = await resumeSession(targetSessionId);
      if (!success) {
        setIsResumingHistory(false);
      }
    } catch {
      setIsResumingHistory(false);
    } finally {
      skipNextAutoConnectRef.current = false;
      setIsManualLoadingMessages(false);
    }
  }, [
    disconnect,
    isConnecting,
    isResumingHistory,
    resumeSession,
    sessionId,
    setCurrentPlan,
    setEntries,
    setIsManualLoadingMessages,
    setIsResumedSession,
    setIsResumingHistory,
    setPendingPermission,
    skipNextAutoConnectRef,
  ]);

  return {
    handleManualLoadMessages,
    handleSelectHistorySession,
    loadHistorySessions,
  };
}
