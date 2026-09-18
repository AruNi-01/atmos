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
import { useStickToBottomContext } from "@workspace/ui";
import type { AgentMessage } from "@atmos/api-types/ws/dto/agent-chat";
import {
  countMessagesBelowViewport,
  type MessagesBelowCountStore,
} from "@/features/agent/lib/agent-chat-below-count";
import {
  resolveActiveUserMessageIndex,
  userMessageRectsFromMeasurements,
} from "@/features/agent/lib/agent-chat-message-nav";
import {
  AGENT_CHAT_MERMAID_KEEPALIVE,
  AGENT_CHAT_TRANSCRIPT_GAP,
  AGENT_CHAT_TRANSCRIPT_OVERSCAN,
  agentMessageHasMermaid,
  estimateAgentChatMessageSize,
  estimateTranscriptInitialOffset,
  estimateTranscriptOffsetToIndex,
  findAgentChatScrollElement,
  isTranscriptScrolledToEnd,
  measureTranscriptScrollMargin,
  mergeMermaidKeepAliveRange,
  mergeIndexKeepAliveRange,
} from "@/features/agent/lib/agent-chat-transcript-window";
import { AgentChatMessageView } from "./AgentChatMessageView";
import { useAgentChatOwnSendRefs } from "./agent-chat-own-send-context";
import { isPendingUserEcho } from "@/features/agent/lib/agent-chat-pending-echo";
import {
  inlineSubagentTasksByMessageId,
  type SubagentCardMode,
} from "@/features/agent/lib/subagent-tasks";

const EMPTY_KEEP_INDEXES: readonly number[] = [];

/**
 * Captures StickToBottom.stopScroll without subscribing the virtualizer to
 * context identity changes on every scroll tick.
 */
function StickToBottomStop({
  stopRef,
}: {
  stopRef: React.MutableRefObject<(() => void) | null>;
}) {
  const { stopScroll } = useStickToBottomContext();
  useLayoutEffect(() => {
    stopRef.current = stopScroll;
    return () => {
      stopRef.current = null;
    };
  }, [stopRef, stopScroll]);
  return null;
}

export function AgentChatTranscriptList({
  messages,
  registryId,
  transcriptRef,
  userMessageIndices,
  onActiveUserMessage,
  onUserScrollIntent,
  scrollToIndexRef,
  belowCountStore = null,
  activityStatus = null,
  subagentCardMode = "live",
  excludeSubagentIds,
  keepMessageIndexes,
  initialScrollIndex = null,
  pinToEnd = false,
}: {
  messages: AgentMessage[];
  registryId: string;
  transcriptRef: RefObject<HTMLDivElement | null>;
  userMessageIndices: readonly number[];
  onActiveUserMessage: (index: number) => void;
  onUserScrollIntent?: () => void;
  scrollToIndexRef: RefObject<((index: number) => void) | null>;
  belowCountStore?: MessagesBelowCountStore | null;
  /**
   * Rendered in-flow under the latest message (last virtual row footer).
   * Keeps the status glued to streaming content so absolute-row overflow cannot
   * paint over a sibling that sits after the virtual list.
   */
  activityStatus?: React.ReactNode;
  subagentCardMode?: SubagentCardMode;
  excludeSubagentIds?: Iterable<string>;
  keepMessageIndexes?: readonly number[];
  initialScrollIndex?: number | null;
  /** Historic transcripts: keep pinning to the last row until the user scrolls away. */
  pinToEnd?: boolean;
}) {
  const listRef = useRef<HTMLDivElement | null>(null);
  const mermaidKeepRef = useRef<number[]>([]);
  const stopStickRef = useRef<(() => void) | null>(null);
  const didAnchorToEndRef = useRef(false);
  const didInitialTargetScrollRef = useRef<number | null>(null);
  const stayPinnedToEndRef = useRef(true);
  const keepIndexes = keepMessageIndexes ?? EMPTY_KEEP_INDEXES;
  const ownSendRefs = useAgentChatOwnSendRefs();
  const pendingFirstSend = isPendingUserEcho(messages.at(-1))
    && messages.filter((item) => item.role === "user").length === 1;
  if (pendingFirstSend && ownSendRefs) {
    ownSendRefs.skipEndAnchorRef.current = true;
  }
  const [scrollMargin, setScrollMargin] = useState(0);
  const roles = messages.map((message) => message.role);
  const mermaidFlags = useMemo(() => messages.map(agentMessageHasMermaid), [messages]);
  const inlineSubagentTools = useMemo(
    () => inlineSubagentTasksByMessageId(messages, {
      mode: subagentCardMode,
      excludeIds: excludeSubagentIds,
    }),
    [excludeSubagentIds, messages, subagentCardMode],
  );

  const getScrollElement = useCallback(
    () => findAgentChatScrollElement(transcriptRef.current),
    [transcriptRef],
  );

  useEffect(() => {
    mermaidKeepRef.current = [];
    didAnchorToEndRef.current = false;
    didInitialTargetScrollRef.current = null;
    stayPinnedToEndRef.current = true;
  }, [registryId]);

  const rangeExtractor = useCallback(
    (range: Parameters<typeof defaultRangeExtractor>[0]) => {
      const merged = mergeMermaidKeepAliveRange(
        defaultRangeExtractor(range),
        mermaidFlags,
        mermaidKeepRef.current,
        mermaidFlags.length,
        AGENT_CHAT_MERMAID_KEEPALIVE,
      );
      mermaidKeepRef.current = merged.kept;
      return mergeIndexKeepAliveRange(merged.range, keepIndexes);
    },
    [keepIndexes, mermaidFlags],
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
    initialOffset: () => {
      if (initialScrollIndex != null && initialScrollIndex >= 0) {
        return estimateTranscriptOffsetToIndex(
          roles,
          initialScrollIndex,
          AGENT_CHAT_TRANSCRIPT_GAP,
          mermaidFlags,
        );
      }
      return estimateTranscriptInitialOffset(
        roles,
        getScrollElement()?.clientHeight ?? 0,
        AGENT_CHAT_TRANSCRIPT_GAP,
        mermaidFlags,
      );
    },
    useAnimationFrameWithResizeObserver: true,
    // measureElement runs during commit; flushSync there warns and can stall React 19.
    useFlushSync: false,
  });

  const virtualItems = virtualizer.getVirtualItems();
  const totalSize = virtualizer.getTotalSize();
  const syncActiveRef = useRef<() => void>(() => undefined);

  useLayoutEffect(() => {
    if (messages.length === 0) return;
    if (didAnchorToEndRef.current && !pinToEnd) return;
    const skipEnd = Boolean(ownSendRefs?.skipEndAnchorRef.current)
      || (initialScrollIndex != null && initialScrollIndex >= 0);
    const list = listRef.current;
    const scroll = getScrollElement();
    if (list && scroll) {
      const next = measureTranscriptScrollMargin(list, scroll);
      if (next !== scrollMargin) {
        setScrollMargin(next);
        return;
      }
    }
    if (skipEnd) {
      didAnchorToEndRef.current = true;
      stayPinnedToEndRef.current = false;
      return;
    }
    if (pinToEnd && !stayPinnedToEndRef.current) return;
    virtualizer.scrollToIndex(messages.length - 1, { align: "end", behavior: "auto" });
    didAnchorToEndRef.current = true;
  }, [
    getScrollElement,
    initialScrollIndex,
    messages.length,
    ownSendRefs,
    pinToEnd,
    scrollMargin,
    totalSize,
    virtualizer,
  ]);

  useLayoutEffect(() => {
    if (initialScrollIndex == null || initialScrollIndex < 0) return;
    if (messages.length === 0) return;
    if (didInitialTargetScrollRef.current === initialScrollIndex) return;
    didInitialTargetScrollRef.current = initialScrollIndex;
    didAnchorToEndRef.current = true;
    stopStickRef.current?.();
    virtualizer.scrollToIndex(initialScrollIndex, { align: "start", behavior: "auto" });
  }, [initialScrollIndex, messages.length, virtualizer]);

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
      stopStickRef.current?.();
      const scroll = getScrollElement();
      const measurement = virtualizer.measurementsCache[index];
      if (scroll && measurement) {
        const top = Math.max(0, measurement.start - virtualizer.options.scrollMargin);
        scroll.scrollTo({ top, behavior: "smooth" });
        return;
      }
      virtualizer.scrollToIndex(index, { align: "start", behavior: "smooth" });
    };
    return () => {
      scrollToIndexRef.current = null;
    };
  }, [getScrollElement, scrollToIndexRef, virtualizer]);

  useLayoutEffect(() => {
    syncActiveRef.current = () => {
      const scroll = getScrollElement();
      if (belowCountStore && scroll) {
        belowCountStore.set(
          countMessagesBelowViewport(
            virtualizer.measurementsCache,
            messages.length,
            { scrollTop: scroll.scrollTop, height: scroll.clientHeight },
          ),
        );
      }
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
    return () => {
      belowCountStore?.set(0);
    };
  }, [belowCountStore]);

  useEffect(() => {
    const scroll = getScrollElement();
    if (!scroll) return;

    let frame: number | null = null;
    const onScroll = () => {
      if (frame != null) return;
      frame = window.requestAnimationFrame(() => {
        frame = null;
        syncActiveRef.current();
      });
    };

    scroll.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      scroll.removeEventListener("scroll", onScroll);
      if (frame != null) window.cancelAnimationFrame(frame);
    };
  }, [getScrollElement]);

  useEffect(() => {
    const scroll = getScrollElement();
    if (!scroll || (!onUserScrollIntent && !pinToEnd)) return;
    const onIntent = () => {
      if (pinToEnd && !isTranscriptScrolledToEnd(scroll)) {
        stayPinnedToEndRef.current = false;
        stopStickRef.current?.();
      }
      onUserScrollIntent?.();
    };
    scroll.addEventListener("wheel", onIntent, { passive: true });
    scroll.addEventListener("touchmove", onIntent, { passive: true });
    scroll.addEventListener("pointerdown", onIntent);
    return () => {
      scroll.removeEventListener("wheel", onIntent);
      scroll.removeEventListener("touchmove", onIntent);
      scroll.removeEventListener("pointerdown", onIntent);
    };
  }, [getScrollElement, onUserScrollIntent, pinToEnd]);

  const lastIndex = messages.length - 1;
  const listScrollMargin = virtualizer.options.scrollMargin;

  return (
    <div className="relative w-full">
      <StickToBottomStop stopRef={stopStickRef} />
      <div
        ref={listRef}
        data-agent-chat-transcript="virtual"
        className="relative w-full"
        style={{ height: virtualizer.getTotalSize(), overflowAnchor: "none" }}
      >
        {virtualItems.map((item) => {
          const message = messages[item.index];
          if (!message) return null;
          const showActivityFooter = activityStatus != null && item.index === lastIndex;
          const invertPx = item.index === ownSendRefs?.anchorIndexRef.current
            ? ownSendRefs.invertPxRef.current
            : 0;
          return (
            <div
              key={item.key}
              data-index={item.index}
              ref={(node) => {
                if (node) virtualizer.measureElement(node);
              }}
              className="absolute top-0 left-0 w-full"
              style={{
                transform: `translateY(${item.start - listScrollMargin + invertPx}px)`,
              }}
              data-own-send-invert={invertPx || undefined}
            >
              <AgentChatMessageView
                message={message}
                index={item.index}
                inlineSubagentTools={inlineSubagentTools.get(message.id)}
                subagentMessages={messages}
              />
              {showActivityFooter ? (
                <div
                  data-agent-chat-activity-status=""
                  className="mx-auto mt-2 w-[calc(100%-1rem)]"
                >
                  {activityStatus}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
