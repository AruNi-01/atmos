"use client";

import { useLayoutEffect, useState, type RefObject } from "react";
import {
  AGENT_CHAT_SCROLL_CLASS,
  findAgentChatScrollElement,
} from "@/features/agent/lib/agent-chat-transcript-window";

/** Ignore a few pixels so a rubber-band at the top does not flash the fade. */
const TOP_FADE_SCROLL_PX = 12;

export function AgentChatEdgeFades({
  rootRef,
  resetKey,
}: {
  rootRef: RefObject<HTMLDivElement | null>;
  resetKey?: string;
}) {
  const [topActive, setTopActive] = useState(false);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const sync = (scrollTop: number) => {
      const next = scrollTop > TOP_FADE_SCROLL_PX;
      setTopActive((current) => (current === next ? current : next));
    };

    const onScroll = (event: Event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (!target.classList.contains(AGENT_CHAT_SCROLL_CLASS)) return;
      sync(target.scrollTop);
    };

    const scroll = findAgentChatScrollElement(root);
    if (scroll) sync(scroll.scrollTop);
    root.addEventListener("scroll", onScroll, { capture: true, passive: true });
    return () => root.removeEventListener("scroll", onScroll, { capture: true });
  }, [rootRef, resetKey]);

  return (
    <>
      <div
        data-agent-chat-edge-fade="top"
        data-active={topActive ? "true" : "false"}
        aria-hidden="true"
        className="agent-chat-edge-fade"
      />
      <div
        data-agent-chat-edge-fade="bottom"
        data-agent-chat-composer-fade=""
        aria-hidden="true"
        className="agent-chat-edge-fade"
      />
    </>
  );
}
