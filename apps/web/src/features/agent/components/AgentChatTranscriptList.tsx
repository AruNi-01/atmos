"use client";

/**
 * Variable-height transcript virtualizer.
 * Git history uses the same @tanstack/react-virtual with fixed 36px rows.
 * Chat rows grow with markdown / tools, so we measureElement instead of a fixed height.
 *
 * Do not read useStickToBottomContext here: that context identity changes on
 * every scroll tick (isAtBottom / state) and would re-render the list.
 * The scroll element is StickToBottom's `.agent-chat-scroll` node.
 *
 * Pinned user prompts stay on the original virtual row (`absolute` + `translateY`).
 * Do not switch that row onto a CSS sticky containing block: it leaves the
 * virtualizer slot and fights React layout against scroll-driven push.
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
import {
  countMessagesBelowViewport,
  type MessagesBelowCountStore,
} from "@/features/agent/lib/agent-chat-below-count";
import {
  nextUserMessageIndex,
  resolveActiveUserMessageIndex,
  resolveStickyUserMessageIndex,
  stickyUserPinLayout,
  userMessageRectsFromMeasurements,
} from "@/features/agent/lib/agent-chat-message-nav";
import {
  AGENT_CHAT_MERMAID_KEEPALIVE,
  AGENT_CHAT_STICKY_USER_FADE_PX,
  AGENT_CHAT_STICKY_USER_ROW_CLASS,
  AGENT_CHAT_STICKY_USER_TOP_PX,
  AGENT_CHAT_TRANSCRIPT_GAP,
  AGENT_CHAT_TRANSCRIPT_OVERSCAN,
  agentMessageHasMermaid,
  estimateAgentChatMessageSize,
  estimateTranscriptInitialOffset,
  findAgentChatScrollElement,
  measureTranscriptScrollMargin,
  mergeMermaidKeepAliveRange,
  mergeStickyUserRange,
} from "@/features/agent/lib/agent-chat-transcript-window";
import { AgentChatMessageView } from "./AgentChatMessageView";

export function AgentChatTranscriptList({
  messages,
  registryId,
  transcriptRef,
  userMessageIndices,
  onActiveUserMessage,
  scrollToIndexRef,
  belowCountStore = null,
  activityStatus = null,
}: {
  messages: AgentMessage[];
  registryId: string;
  transcriptRef: RefObject<HTMLDivElement | null>;
  userMessageIndices: readonly number[];
  onActiveUserMessage: (index: number) => void;
  scrollToIndexRef: RefObject<((index: number) => void) | null>;
  belowCountStore?: MessagesBelowCountStore | null;
  /**
   * Rendered in-flow under the latest message (last virtual row footer).
   * Keeps the status glued to streaming content so absolute-row overflow cannot
   * paint over a sibling that sits after the virtual list.
   */
  activityStatus?: React.ReactNode;
}) {
  const listRef = useRef<HTMLDivElement | null>(null);
  const mermaidKeepRef = useRef<number[]>([]);
  const stickyNodeRef = useRef<HTMLDivElement | null>(null);
  const stickyUserIndexRef = useRef<number | null>(null);
  const measurementsRef = useRef<Array<{ start: number; size: number } | undefined>>([]);
  const [scrollMargin, setScrollMargin] = useState(0);
  const [stickyUserIndex, setStickyUserIndex] = useState<number | null>(null);
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
      const scroll = getScrollElement();
      const sticky = scroll
        ? resolveStickyUserMessageIndex(
            userMessageIndices,
            measurementsRef.current,
            scroll.scrollTop,
          )
        : stickyUserIndexRef.current;
      const base = mergeStickyUserRange(defaultRangeExtractor(range), sticky);
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
    [getScrollElement, mermaidFlags, userMessageIndices],
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

  measurementsRef.current = virtualizer.measurementsCache;
  const virtualItems = virtualizer.getVirtualItems();
  const syncActiveRef = useRef<() => void>(() => undefined);
  const didAnchorToEndRef = useRef(false);

  const applyStickyPin = useCallback(
    (stickyIndex: number, scroll: HTMLElement) => {
      const node = stickyNodeRef.current;
      if (!node || Number(node.dataset.index) !== stickyIndex) return;
      const measurement = measurementsRef.current[stickyIndex];
      if (!measurement) return;
      const incomingIndex = nextUserMessageIndex(userMessageIndices, stickyIndex);
      const nextStart =
        incomingIndex == null ? null : measurementsRef.current[incomingIndex]?.start;
      const pin = stickyUserPinLayout(
        scroll.scrollTop,
        virtualizer.options.scrollMargin,
        measurement.size,
        nextStart,
        AGENT_CHAT_TRANSCRIPT_GAP,
        AGENT_CHAT_STICKY_USER_TOP_PX,
        AGENT_CHAT_STICKY_USER_FADE_PX,
      );
      node.style.transform = `translateY(${pin.translateY}px)`;
      node.dataset.stickyUserFade = pin.hideFade ? "off" : "";
    },
    [userMessageIndices, virtualizer],
  );

  const updateStickyUser = useCallback(() => {
    const scroll = getScrollElement();
    if (!scroll) return;
    const next = resolveStickyUserMessageIndex(
      userMessageIndices,
      virtualizer.measurementsCache,
      scroll.scrollTop,
    );
    if (next !== stickyUserIndexRef.current) {
      stickyUserIndexRef.current = next;
      setStickyUserIndex(next);
    }
    if (next != null) applyStickyPin(next, scroll);
  }, [applyStickyPin, getScrollElement, userMessageIndices, virtualizer]);

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
      updateStickyUser();
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
      updateStickyUser();
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
  }, [getScrollElement, updateStickyUser]);

  const lastIndex = messages.length - 1;
  const listScrollMargin = virtualizer.options.scrollMargin;
  const scrollTop = getScrollElement()?.scrollTop ?? 0;

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
        const showActivityFooter = activityStatus != null && item.index === lastIndex;
        const isStickyUser = message.role === "user" && item.index === stickyUserIndex;
        const incomingIndex = isStickyUser
          ? nextUserMessageIndex(userMessageIndices, item.index)
          : null;
        const nextStart =
          incomingIndex == null
            ? null
            : virtualizer.measurementsCache[incomingIndex]?.start;
        const pin = isStickyUser
          ? stickyUserPinLayout(
              scrollTop,
              listScrollMargin,
              item.size,
              nextStart,
              AGENT_CHAT_TRANSCRIPT_GAP,
              AGENT_CHAT_STICKY_USER_TOP_PX,
              AGENT_CHAT_STICKY_USER_FADE_PX,
            )
          : null;
        const translateY = pin?.translateY ?? item.start - listScrollMargin;
        const hideStickyFade = pin?.hideFade === true;
        return (
          <div
            key={item.key}
            data-index={item.index}
            data-agent-chat-sticky-user={isStickyUser ? "" : undefined}
            data-sticky-user-fade={hideStickyFade ? "off" : undefined}
            ref={(node) => {
              virtualizer.measureElement(node);
              if (isStickyUser) stickyNodeRef.current = node;
              else if (stickyNodeRef.current === node) stickyNodeRef.current = null;
            }}
            className={
              isStickyUser
                ? `absolute top-0 left-0 w-full ${AGENT_CHAT_STICKY_USER_ROW_CLASS}`
                : "absolute top-0 left-0 w-full"
            }
            style={{
              transform: `translateY(${translateY}px)`,
            }}
          >
            <AgentChatMessageView
              message={message}
              index={item.index}
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
  );
}
