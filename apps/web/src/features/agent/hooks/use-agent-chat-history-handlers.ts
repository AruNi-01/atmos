"use client";

import {
  useCallback,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import { type AgentChatSessionItem } from "@/api/rest-api";
import type { AgentPlan, ResumeSessionInput } from "@/features/agent/hooks/use-agent-session";
import type { ThreadEntry } from "@/features/agent/lib/agent/thread";
import type { PendingPermission } from "../lib/chat-helpers";

interface UseAgentChatHistoryHandlersParams {
  autoResumeTriedRef: MutableRefObject<string | null>;
  autoStartHandledRef: MutableRefObject<boolean>;
  canUseCurrentMode: boolean;
  disconnect: () => void;
  isConnected: boolean;
  isConnecting: boolean;
  isResumingHistory: boolean;
  projectId: string | null;
  resumeSession: (input: ResumeSessionInput) => Promise<boolean>;
  sessionId: string | null;
  setCurrentPlan: Dispatch<SetStateAction<AgentPlan | null>>;
  setEntries: Dispatch<SetStateAction<ThreadEntry[]>>;
  setHistoryOpen: Dispatch<SetStateAction<boolean>>;
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
  restoreAttemptedRef: MutableRefObject<boolean>;
  skipNextAutoConnectRef: MutableRefObject<boolean>;
  stoppedRef: MutableRefObject<boolean>;
  workspaceId: string | null;
}

export function useAgentChatHistoryHandlers({
  autoResumeTriedRef,
  autoStartHandledRef,
  canUseCurrentMode,
  disconnect,
  isConnected,
  isConnecting,
  isResumingHistory,
  projectId,
  resumeSession,
  sessionId,
  setCurrentPlan,
  setEntries,
  setHistoryOpen,
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
  restoreAttemptedRef,
  skipNextAutoConnectRef,
  stoppedRef,
  workspaceId,
}: UseAgentChatHistoryHandlersParams) {
  const handleSelectHistorySession = useCallback(
    async (session: AgentChatSessionItem) => {
      if (isConnecting || !canUseCurrentMode) return;
      if (sessionId === session.acp_session_id && isConnected) {
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
      setSessionTitleSource(null);
      setIsAutoGeneratingTitle(false);
      setShouldScrambleAutoTitle(false);
      setIsResumedSession(true);
      setIsResumingHistory(true);
      autoResumeTriedRef.current = null;
      restoreAttemptedRef.current = true;
      autoStartHandledRef.current = true;
      try {
        const success = await resumeSession({
          registryId: session.registry_id,
          acpSessionId: session.acp_session_id,
          cwd: session.cwd,
          workspaceId,
          projectId,
        });
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
      autoStartHandledRef,
      canUseCurrentMode,
      disconnect,
      isConnected,
      isConnecting,
      projectId,
      resumeSession,
      restoreAttemptedRef,
      sessionId,
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
      workspaceId,
    ],
  );

  const handleManualLoadMessages = useCallback(async () => {
    const targetSessionId = sessionId;
    if (!targetSessionId || isConnecting || isResumingHistory) return;

    setIsManualLoadingMessages(true);
    try {
      setIsResumingHistory(false);
    } finally {
      setIsManualLoadingMessages(false);
    }
  }, [
    isConnecting,
    isResumingHistory,
    sessionId,
    setIsManualLoadingMessages,
    setIsResumingHistory,
  ]);

  return {
    handleManualLoadMessages,
    handleSelectHistorySession,
  };
}
