"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { messagesToMarkdown, type ConversationMessage } from "@workspace/ui";
import type { AgentMessage } from "@atmos/api-types/ws/dto/agent-chat";
import {
  downloadChatMarkdown,
  getLocalTimestampForFilename,
  sanitizeChatFilename,
  writeDefaultAgentRegistryId,
} from "../lib/chat-helpers";

interface UseAgentChatUiHandlersParams {
  displaySessionTitle: string | null;
  messages: AgentMessage[];
  exportableMessages: ConversationMessage[];
  panelTitle: string;
  setDefaultRegistryId: Dispatch<SetStateAction<string>>;
}

export function useAgentChatUiHandlers({
  displaySessionTitle,
  messages,
  exportableMessages,
  panelTitle,
  setDefaultRegistryId,
}: UseAgentChatUiHandlersParams) {
  const [newSessionAgentsOpen, setNewSessionAgentsOpen] = useState(false);
  const [messageNavIndex, setMessageNavIndex] = useState(-1);
  const closeAgentsMenuTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollToIndexRef = useRef<((index: number) => void) | null>(null);

  const userMessageIndices = useMemo(
    () => messages.map((message, index) => (message.role === "user" ? index : -1)).filter((index) => index >= 0),
    [messages],
  );

  const handleSelectMessage = useCallback((messageIndex: number) => {
    if (!userMessageIndices.includes(messageIndex)) return;
    scrollToIndexRef.current?.(messageIndex);
    setMessageNavIndex(messageIndex);
  }, [userMessageIndices]);

  useEffect(() => {
    if (userMessageIndices.length === 0) {
      setMessageNavIndex(-1);
    }
  }, [userMessageIndices.length]);

  const clearCloseAgentsMenuTimer = useCallback(() => {
    if (closeAgentsMenuTimerRef.current) {
      clearTimeout(closeAgentsMenuTimerRef.current);
      closeAgentsMenuTimerRef.current = null;
    }
  }, []);

  const handleOpenNewSessionAgentsMenu = useCallback(() => {
    clearCloseAgentsMenuTimer();
    setNewSessionAgentsOpen(true);
  }, [clearCloseAgentsMenuTimer]);

  const handleScheduleCloseNewSessionAgentsMenu = useCallback(() => {
    clearCloseAgentsMenuTimer();
    closeAgentsMenuTimerRef.current = setTimeout(() => {
      setNewSessionAgentsOpen(false);
    }, 120);
  }, [clearCloseAgentsMenuTimer]);

  const handleSetDefaultAgent = useCallback((agentId: string) => {
    setDefaultRegistryId(agentId);
    writeDefaultAgentRegistryId(agentId);
  }, [setDefaultRegistryId]);

  useEffect(() => clearCloseAgentsMenuTimer, [clearCloseAgentsMenuTimer]);

  const handleExportChat = useCallback(() => {
    if (exportableMessages.length === 0) return;

    const timestamp = getLocalTimestampForFilename();
    const markdown = messagesToMarkdown(exportableMessages);
    downloadChatMarkdown(
      `${sanitizeChatFilename(displaySessionTitle ?? panelTitle ?? "chat")}-${timestamp}.md`,
      markdown,
    );
  }, [displaySessionTitle, exportableMessages, panelTitle]);

  return {
    handleExportChat,
    handleOpenNewSessionAgentsMenu,
    handleScheduleCloseNewSessionAgentsMenu,
    handleSelectMessage,
    handleSetDefaultAgent,
    messageNavIndex,
    setMessageNavIndex,
    newSessionAgentsOpen,
    setNewSessionAgentsOpen,
    scrollToIndexRef,
    userMessageIndices,
  };
}
