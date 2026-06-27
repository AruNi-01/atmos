"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from "react";
import { messagesToMarkdown, type ConversationMessage } from "@workspace/ui";
import type { ThreadEntry } from "@/features/agent/lib/agent/thread";
import {
  downloadConversationMarkdown,
  getLocalTimestampForFilename,
  sanitizeConversationFilename,
  writeDefaultAgentRegistryId,
} from "../lib/chat-helpers";

interface UseAgentChatUiHandlersParams {
  conversationRef: RefObject<HTMLDivElement | null>;
  displaySessionTitle: string | null;
  entries: ThreadEntry[];
  exportableMessages: ConversationMessage[];
  panelTitle: string;
  setDefaultRegistryId: Dispatch<SetStateAction<string>>;
}

export function useAgentChatUiHandlers({
  conversationRef,
  displaySessionTitle,
  entries,
  exportableMessages,
  panelTitle,
  setDefaultRegistryId,
}: UseAgentChatUiHandlersParams) {
  const [newSessionAgentsOpen, setNewSessionAgentsOpen] = useState(false);
  const [messageNavIndex, setMessageNavIndex] = useState(-1);
  const closeAgentsMenuTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const userEntryIndices = useMemo(
    () => entries.map((entry, index) => (entry.role === "user" ? index : -1)).filter((index) => index >= 0),
    [entries],
  );

  const scrollToMessage = useCallback((messageIndex: number) => {
    const el = conversationRef.current?.querySelector(
      `[data-entry-index="${messageIndex}"]`,
    ) as HTMLElement | null;
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start", inline: "nearest" });
    }
    setMessageNavIndex(messageIndex);
  }, [conversationRef]);

  const handleSelectMessage = useCallback((messageIndex: number) => {
    if (!userEntryIndices.includes(messageIndex)) return;
    scrollToMessage(messageIndex);
  }, [scrollToMessage, userEntryIndices]);

  useEffect(() => {
    const root = conversationRef.current;
    if (!root) return;
    if (userEntryIndices.length === 0) {
      setMessageNavIndex(-1);
      return;
    }

    const scrollElement = root.querySelector(".agent-chat-scroll") as HTMLElement | null;
    if (!scrollElement) return;

    let frame: number | null = null;

    const syncActiveMessageFromScroll = () => {
      const scrollRect = scrollElement.getBoundingClientRect();
      const activationLine = Math.min(120, Math.max(56, scrollElement.clientHeight * 0.18));
      let activeIndex = userEntryIndices[0];
      let firstBelowLine: number | null = null;

      for (const entryIndex of userEntryIndices) {
        const el = root.querySelector(`[data-entry-index="${entryIndex}"]`) as HTMLElement | null;
        if (!el) continue;

        const top = el.getBoundingClientRect().top - scrollRect.top;
        if (top <= activationLine) {
          activeIndex = entryIndex;
          continue;
        }

        firstBelowLine ??= entryIndex;
      }

      if (activeIndex === userEntryIndices[0] && firstBelowLine != null && scrollElement.scrollTop <= 4) {
        activeIndex = firstBelowLine;
      }

      setMessageNavIndex((prev) => (prev === activeIndex ? prev : activeIndex));
    };

    const scheduleSync = () => {
      if (frame != null) return;
      frame = window.requestAnimationFrame(() => {
        frame = null;
        syncActiveMessageFromScroll();
      });
    };

    scheduleSync();
    scrollElement.addEventListener("scroll", scheduleSync, { passive: true });

    return () => {
      scrollElement.removeEventListener("scroll", scheduleSync);
      if (frame != null) {
        window.cancelAnimationFrame(frame);
      }
    };
  }, [conversationRef, userEntryIndices]);

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
    handleExportConversation,
    handleOpenNewSessionAgentsMenu,
    handleScheduleCloseNewSessionAgentsMenu,
    handleSelectMessage,
    handleSetDefaultAgent,
    messageNavIndex,
    newSessionAgentsOpen,
    setNewSessionAgentsOpen,
    userEntryIndices,
  };
}
