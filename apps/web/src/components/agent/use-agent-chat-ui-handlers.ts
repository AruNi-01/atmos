"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type KeyboardEvent,
  type RefObject,
  type SetStateAction,
} from "react";
import { messagesToMarkdown, type ConversationMessage } from "@workspace/ui";
import { agentApi as agentRestApi } from "@/api/rest-api";
import type { ThreadEntry } from "@/lib/agent/thread";
import {
  downloadConversationMarkdown,
  getLocalTimestampForFilename,
  sanitizeConversationFilename,
  writeDefaultAgentRegistryId,
} from "./chat-helpers";

interface UseAgentChatUiHandlersParams {
  conversationRef: RefObject<HTMLDivElement | null>;
  displaySessionTitle: string | null;
  entries: ThreadEntry[];
  exportableMessages: ConversationMessage[];
  panelTitle: string;
  sessionId: string | null;
  sessionTitle: string | null;
  setDefaultRegistryId: Dispatch<SetStateAction<string>>;
  setIsAutoGeneratingTitle: Dispatch<SetStateAction<boolean>>;
  setSessionTitle: Dispatch<SetStateAction<string | null>>;
  setSessionTitleSource: Dispatch<SetStateAction<string | null>>;
  setShouldScrambleAutoTitle: Dispatch<SetStateAction<boolean>>;
  titleInputRef: RefObject<HTMLInputElement | null>;
}

export function useAgentChatUiHandlers({
  conversationRef,
  displaySessionTitle,
  entries,
  exportableMessages,
  panelTitle,
  sessionId,
  sessionTitle,
  setDefaultRegistryId,
  setIsAutoGeneratingTitle,
  setSessionTitle,
  setSessionTitleSource,
  setShouldScrambleAutoTitle,
  titleInputRef,
}: UseAgentChatUiHandlersParams) {
  const [newSessionAgentsOpen, setNewSessionAgentsOpen] = useState(false);
  const [messageNavIndex, setMessageNavIndex] = useState(-1);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editingTitleValue, setEditingTitleValue] = useState("");
  const closeAgentsMenuTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const userEntryIndices = useMemo(
    () => entries.map((entry, index) => (entry.role === "user" ? index : -1)).filter((index) => index >= 0),
    [entries],
  );

  const handleStartEditTitle = useCallback(() => {
    if (!sessionTitle) return;
    setEditingTitleValue(sessionTitle);
    setIsEditingTitle(true);
    requestAnimationFrame(() => titleInputRef.current?.focus());
  }, [sessionTitle, titleInputRef]);

  const handleFinishEditTitle = useCallback(() => {
    setIsEditingTitle(false);
    const trimmed = editingTitleValue.trim();
    if (!trimmed || trimmed === sessionTitle) return;
    setSessionTitle(trimmed);
    setSessionTitleSource("user");
    setIsAutoGeneratingTitle(false);
    setShouldScrambleAutoTitle(false);
    if (sessionId) {
      void agentRestApi.updateSessionTitle(sessionId, trimmed).catch(() => { });
    }
  }, [
    editingTitleValue,
    sessionId,
    sessionTitle,
    setIsAutoGeneratingTitle,
    setSessionTitle,
    setSessionTitleSource,
    setShouldScrambleAutoTitle,
  ]);

  const handleTitleKeyDown = useCallback((event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      handleFinishEditTitle();
    } else if (event.key === "Escape") {
      setIsEditingTitle(false);
    }
  }, [handleFinishEditTitle]);

  const scrollToMessage = useCallback((messageIndex: number) => {
    const el = conversationRef.current?.querySelector(
      `[data-entry-index="${messageIndex}"]`,
    ) as HTMLElement | null;
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start", inline: "nearest" });
    }
    setMessageNavIndex(messageIndex);
  }, [conversationRef]);

  const handlePrevMessage = useCallback(() => {
    if (userEntryIndices.length === 0) return;
    const currentIdx = userEntryIndices.indexOf(messageNavIndex);
    if (currentIdx < 0) {
      scrollToMessage(userEntryIndices[userEntryIndices.length - 1]);
      return;
    }
    if (currentIdx <= 0) return;
    scrollToMessage(userEntryIndices[currentIdx - 1]);
  }, [messageNavIndex, scrollToMessage, userEntryIndices]);

  const handleNextMessage = useCallback(() => {
    if (userEntryIndices.length === 0) return;
    const currentIdx = userEntryIndices.indexOf(messageNavIndex);
    if (currentIdx < 0) {
      scrollToMessage(userEntryIndices[0]);
      return;
    }
    if (currentIdx >= userEntryIndices.length - 1) return;
    scrollToMessage(userEntryIndices[currentIdx + 1]);
  }, [messageNavIndex, scrollToMessage, userEntryIndices]);

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

  const handleExportConversation = useCallback(() => {
    if (exportableMessages.length === 0) return;

    const timestamp = getLocalTimestampForFilename();
    const markdown = messagesToMarkdown(exportableMessages);
    downloadConversationMarkdown(
      `${sanitizeConversationFilename(displaySessionTitle ?? panelTitle ?? "conversation")}-${timestamp}.md`,
      markdown,
    );
  }, [displaySessionTitle, exportableMessages, panelTitle]);

  return {
    editingTitleValue,
    handleExportConversation,
    handleFinishEditTitle,
    handleNextMessage,
    handleOpenNewSessionAgentsMenu,
    handlePrevMessage,
    handleScheduleCloseNewSessionAgentsMenu,
    handleSetDefaultAgent,
    handleStartEditTitle,
    handleTitleKeyDown,
    isEditingTitle,
    messageNavIndex,
    newSessionAgentsOpen,
    setEditingTitleValue,
    setIsEditingTitle,
    setNewSessionAgentsOpen,
    userEntryIndices,
  };
}
