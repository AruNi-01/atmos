"use client";

/**
 * Variable-height transcript virtualizer.
 * Git history uses the same @tanstack/react-virtual with fixed 36px rows.
 * Chat rows grow with markdown / tools, so we measureElement instead of a fixed height.
 *
 * Do not read useStickToBottomContext here: that context identity changes on
 * every scroll tick (isAtBottom / state) and would re-render the list.
 * The scroll element is StickToBottom's `.agent-chat-scroll` node.
 */

import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import { defaultRangeExtractor, useVirtualizer } from "@tanstack/react-virtual";
import type { AgentMessage } from "@atmos/api-types/ws/dto/agent-chat";
import { resolveActiveUserMessageIndex, userMessageRectsFromMeasurements } from "@/features/agent/lib/agent-chat-message-nav";
import {
  AGENT_CHAT_MERMAID_KEEPALIVE,
  AGENT_CHAT_TRANSCRIPT_GAP,
  AGENT_CHAT_TRANSCRIPT_OVERSCAN,
  agentMessageHasMermaid,
  estimateAgentChatMessageSize,
  estimateTranscriptInitialOffset,
  findAgentChatScrollElement,
  measureTranscriptScrollMargin,
  mergeMermaidKeepAliveRange,
} from "@/features/agent/lib/agent-chat-transcript-window";
import { AgentChatMessageView } from "./AgentChatMessageView";

export function AgentChatTranscriptList({
  messages,
  registryId,
  transcriptRef,
  userMessageIndices,
  onActiveUserMessage,
  scrollToIndexRef,
}: {
  messages: AgentMessage[];
  registryId: string;
  transcriptRef: RefObject<HTMLDivElement | null>;
  userMessageIndices: readonly number[];
  onActiveUserMessage: (index: number) => void;
  scrollToIndexRef: RefObject<((index: number) => void) | null>;
}) {
  const listRef = useRef<HTMLDivElement | null>(null);
  const mermaidKeepRef = useRef<number[]>([]);
  const [scrollMargin, setScrollMargin] = useState(0);
  const roles = messages.map((message) => message.role);
  const mermaidFlags = useMemo(() => messages.map(agentMessageHasMermaid), [messages]);

  const getScrollElement = useCallback(
    () => findAgentChatScrollElement(transcriptRef.current),
    [transcriptRef],
  );

  useEffect(() => {
    mermaidKeepRef.current = [];
  }, [registryId]);

  const rangeExtractor = useCallback(
    (range: Parameters<typeof defaultRangeExtractor>[0]) => {
      const base = defaultRangeExtractor(range);
      const merged = mergeMermaidKeepAliveRange(
        base,
        mermaidFlags,
        mermaidKeepRef.current,
        mermaidFlags.length,
        AGENT_CHAT_MERMAID_KEEPALIVE,
      );
      mermaidKeepRef.current = merged.kept;
      return merged.range;
    },
    [mermaidFlags],
  );

  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement,
    estimateSize: (index) =>
      estimateAgentChatMessageSize(messages[index]?.role ?? "assistant", mermaidFlags[index] === true),
    getItemKey: (index) => messages[index]?.id ?? index,
    overscan: AGENT_CHAT_TRANSCRIPT_OVERSCAN,
    gap: AGENT_CHAT_TRANSCRIPT_GAP,
    scrollMargin,
    rangeExtractor,
    initialOffset: () =>
      estimateTranscriptInitialOffset(
        roles,
        getScrollElement()?.clientHeight ?? 0,
        AGENT_CHAT_TRANSCRIPT_GAP,
        mermaidFlags,
      ),
    useAnimationFrameWithResizeObserver: true,
    // measureElement runs during commit; flushSync there warns and can stall React 19.
    useFlushSync: false,
  });

  const virtualItems = virtualizer.getVirtualItems();
  const syncActiveRef = useRef<() => void>(() => undefined);
  const didAnchorToEndRef = useRef(false);

  useLayoutEffect(() => {
    if (didAnchorToEndRef.current || messages.length === 0) return;
    const list = listRef.current;
    const scroll = getScrollElement();
    if (list && scroll) {
      const next = measureTranscriptScrollMargin(list, scroll);
      if (next !== scrollMargin) {
        setScrollMargin(next);
        return;
      }
    }
    didAnchorToEndRef.current = true;
    virtualizer.scrollToIndex(messages.length - 1, { align: "end", behavior: "auto" });
  }, [getScrollElement, messages.length, scrollMargin, virtualizer]);

  useLayoutEffect(() => {
    const list = listRef.current;
    const scroll = getScrollElement();
    if (!list || !scroll) return;

    const updateMargin = () => {
      const next = measureTranscriptScrollMargin(list, scroll);
      setScrollMargin((current) => (current === next ? current : next));
    };

    updateMargin();
    const observer = new ResizeObserver(updateMargin);
    observer.observe(list);
    if (list.parentElement) observer.observe(list.parentElement);
    observer.observe(scroll);
    return () => observer.disconnect();
  }, [getScrollElement, messages.length]);

  useLayoutEffect(() => {
    scrollToIndexRef.current = (index: number) => {
      virtualizer.scrollToIndex(index, { align: "start", behavior: "smooth" });
    };
    return () => {
      scrollToIndexRef.current = null;
    };
  }, [scrollToIndexRef, virtualizer]);

  useLayoutEffect(() => {
    syncActiveRef.current = () => {
      const scroll = getScrollElement();
      if (!scroll || userMessageIndices.length === 0) return;
      const rects = userMessageRectsFromMeasurements(
        userMessageIndices,
        virtualizer.measurementsCache,
        scroll.scrollTop,
      );
      const activeIndex = resolveActiveUserMessageIndex(rects, {
        height: scroll.clientHeight,
        scrollTop: scroll.scrollTop,
        scrollHeight: scroll.scrollHeight,
      });
      if (activeIndex == null) return;
      onActiveUserMessage(activeIndex);
    };
    syncActiveRef.current();
  });

  useEffect(() => {
    const scroll = getScrollElement();
    if (!scroll) return;

    let frame: number | null = null;
    const scheduleSync = () => {
      if (frame != null) return;
      frame = window.requestAnimationFrame(() => {
        frame = null;
        syncActiveRef.current();
      });
    };

    scroll.addEventListener("scroll", scheduleSync, { passive: true });
    return () => {
      scroll.removeEventListener("scroll", scheduleSync);
      if (frame != null) window.cancelAnimationFrame(frame);
    };
  }, [getScrollElement]);

  return (
    <div
      ref={listRef}
      data-agent-chat-transcript="virtual"
      className="relative w-full"
      style={{ height: virtualizer.getTotalSize(), overflowAnchor: "none" }}
    >
      {virtualItems.map((item) => {
        const message = messages[item.index];
        if (!message) return null;
        return (
          <div
            key={item.key}
            data-index={item.index}
            ref={virtualizer.measureElement}
            className="absolute top-0 left-0 w-full"
            style={{
              transform: `translateY(${item.start - virtualizer.options.scrollMargin}px)`,
            }}
          >
            <AgentChatMessageView
              message={message}
              index={item.index}
              registryId={registryId}
            />
          </div>
        );
      })}
    </div>
  );
}
