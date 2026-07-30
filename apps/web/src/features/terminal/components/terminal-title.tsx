"use client";

import React, { useEffect, useRef, useState } from "react";
import { Bot, Terminal as TerminalIcon } from "lucide-react";
import { cn } from "@workspace/ui";
import {
  getTerminalDisplayMeta,
  getTerminalDisplayTitle,
  isPathLikeTitle,
  resolveAgentForTitle,
} from "@atmos/shared/terminal";
import { AgentIcon } from "@/features/agent/components/AgentIcon";
import type { TerminalPaneAgent } from "../types/index";

export {
  getTerminalDisplayMeta,
  getTerminalDisplayTitle,
  isPathLikeTitle,
  resolveAgentForTitle,
};

/**
 * Horizontal marquee for overflow text (OSC session topics in the pane toolbar).
 * Only animates when the content is wider than the available slot.
 */
export function TerminalTitleMarquee({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLSpanElement>(null);
  const [overflowPx, setOverflowPx] = useState(0);

  useEffect(() => {
    const container = containerRef.current;
    const content = contentRef.current;
    if (!container || !content) return;

    const measure = () => {
      const overflow = Math.max(0, content.scrollWidth - container.clientWidth);
      setOverflowPx(overflow);
      container.style.setProperty("--marquee-distance", `${overflow}px`);
      // ~40px/s with a floor so short overflows still read, and a ceiling for long titles.
      const durationSec = overflow > 0 ? Math.min(28, Math.max(6, overflow / 40)) : 0;
      container.style.setProperty("--marquee-duration", `${durationSec}s`);
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(container);
    ro.observe(content);
    return () => ro.disconnect();
  }, [text]);

  return (
    <div
      ref={containerRef}
      className={cn("terminal-title-marquee", className)}
      title={text}
    >
      <span
        ref={contentRef}
        className={cn(
          "terminal-title-marquee-text",
          overflowPx > 0 && "is-overflowing",
        )}
      >
        {text}
      </span>
    </div>
  );
}

interface TerminalTitleWithAgentProps {
  displayTitle: string;
  /** Atmos primary title (agent/command/path). Falls back to displayTitle. */
  primaryTitle?: string;
  /** Filtered OSC suffix; when set, shown after `|` with marquee on overflow. */
  oscSuffix?: string;
  toolbarAgent: TerminalPaneAgent | undefined;
  className?: string;
}

export function TerminalTitleWithAgent({
  displayTitle,
  primaryTitle,
  oscSuffix,
  toolbarAgent,
  className,
}: TerminalTitleWithAgentProps) {
  const primary = (primaryTitle ?? displayTitle).trim();
  const osc = oscSuffix?.trim() ?? "";

  return (
    <div className={cn("flex min-w-0 items-center", className)}>
      <span className="inline-flex shrink-0 items-center">
        {toolbarAgent?.iconType === "built-in" ? (
          <AgentIcon registryId={toolbarAgent.id} name={toolbarAgent.label} size={14} />
        ) : toolbarAgent?.iconType === "custom" ? (
          <Bot className="size-3.5 text-muted-foreground" />
        ) : (
          <TerminalIcon className="size-3.5 text-muted-foreground" />
        )}
      </span>
      <span
        className={cn(
          "ml-0.5 truncate",
          osc ? "max-w-[42%] shrink-0" : "min-w-0",
        )}
      >
        {primary}
      </span>
      {osc ? (
        <>
          <span className="mx-1 shrink-0 text-muted-foreground/70" aria-hidden>
            |
          </span>
          <TerminalTitleMarquee text={osc} className="min-w-0 flex-1" />
        </>
      ) : null}
    </div>
  );
}
