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
import type { AgentMessage } from "@atmos/api-types/ws/dto/agent-chat";
import {
  downloadChatMarkdown,
  getLocalTimestampForFilename,
  sanitizeChatFilename,
  writeDefaultAgentRegistryId,
} from "../lib/chat-helpers";
import { resolveActiveUserMessageIndex } from "../lib/agent-chat-message-nav";

interface UseAgentChatUiHandlersParams {
  transcriptRef: RefObject<HTMLDivElement | null>;
  displaySessionTitle: string | null;
  messages: AgentMessage[];
  exportableMessages: ConversationMessage[];
  panelTitle: string;
  setDefaultRegistryId: Dispatch<SetStateAction<string>>;
}

export function useAgentChatUiHandlers({
  transcriptRef,
  displaySessionTitle,
  messages,
  exportableMessages,
  panelTitle,
  setDefaultRegistryId,
}: UseAgentChatUiHandlersParams) {
  const [newSessionAgentsOpen, setNewSessionAgentsOpen] = useState(false);
  const [messageNavIndex, setMessageNavIndex] = useState(-1);
  const closeAgentsMenuTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const userMessageIndices = useMemo(
    () => messages.map((message, index) => (message.role === "user" ? index : -1)).filter((index) => index >= 0),
    [messages],
  );

  const scrollToMessage = useCallback((messageIndex: number) => {
    const el = transcriptRef.current?.querySelector(
      `[data-message-index="${messageIndex}"]`,
    ) as HTMLElement | null;
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start", inline: "nearest" });
    }
    setMessageNavIndex(messageIndex);
  }, [transcriptRef]);

  const handleSelectMessage = useCallback((messageIndex: number) => {
    if (!userMessageIndices.includes(messageIndex)) return;
    scrollToMessage(messageIndex);
  }, [scrollToMessage, userMessageIndices]);

  useEffect(() => {
    const root = transcriptRef.current;
    if (!root) return;
    if (userMessageIndices.length === 0) {
      setMessageNavIndex(-1);
      return;
    }

    const scrollElement = root.querySelector(".agent-chat-scroll") as HTMLElement | null;
    if (!scrollElement) return;

    let frame: number | null = null;
    const messageElements = userMessageIndices
      .map((messageIndex) => ({
        messageIndex,
        el: root.querySelector(`[data-message-index="${messageIndex}"]`) as HTMLElement | null,
      }))
      .filter((item): item is { messageIndex: number; el: HTMLElement } => Boolean(item.el));

    const syncActiveMessageFromScroll = () => {
      const scrollRect = scrollElement.getBoundingClientRect();
      const activeIndex = resolveActiveUserMessageIndex(
        messageElements.map(({ messageIndex, el }) => {
          const rect = el.getBoundingClientRect();
          return {
            messageIndex,
            top: rect.top - scrollRect.top,
            bottom: rect.bottom - scrollRect.top,
          };
        }),
        {
          height: scrollElement.clientHeight,
          scrollTop: scrollElement.scrollTop,
          scrollHeight: scrollElement.scrollHeight,
        },
      );
      if (activeIndex == null) return;
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
  }, [transcriptRef, userMessageIndices]);

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
    newSessionAgentsOpen,
    setNewSessionAgentsOpen,
    userMessageIndices,
  };
}
