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
 * Show `text` normally; if it overflows the available width, scroll it as a marquee.
 * Parent must provide a bounded width (`min-w-0` + flex/grid child).
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
  // Bump on every text change so the animating node remounts at translateX(0)
  // instead of continuing mid-scroll from the previous title.
  const [animKey, setAnimKey] = useState(0);

  useEffect(() => {
    setOverflowPx(0);
    setAnimKey((k) => k + 1);
  }, [text]);

  useEffect(() => {
    const container = containerRef.current;
    const content = contentRef.current;
    if (!container || !content) return;

    const measure = () => {
      // Force start position before measuring (in case animation already advanced).
      content.style.transform = "translateX(0)";
      const overflow = Math.max(0, content.scrollWidth - container.clientWidth);
      setOverflowPx(overflow);
      container.style.setProperty("--marquee-distance", `${overflow}px`);
      const durationSec = overflow > 0 ? Math.min(28, Math.max(6, overflow / 40)) : 0;
      container.style.setProperty("--marquee-duration", `${durationSec}s`);
      // Clear inline transform so CSS animation owns it again.
      content.style.transform = "";
    };

    measure();
    const raf = requestAnimationFrame(measure);
    const ro = new ResizeObserver(measure);
    ro.observe(container);
    ro.observe(content);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [text, animKey]);

  return (
    <div
      ref={containerRef}
      className={cn("terminal-title-marquee", className)}
      title={text}
    >
      <span
        key={`${animKey}:${text}`}
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
  /** Atmos primary title (agent/command/path). Optional; used to keep left side fixed. */
  primaryTitle?: string;
  /** Filtered OSC suffix. Optional; marquee when long. */
  oscSuffix?: string;
  toolbarAgent: TerminalPaneAgent | undefined;
  className?: string;
}

/**
 * Pane toolbar title.
 *
 * Pre-marquee behavior (always worked): icon + single `displayTitle` string
 * including `primary | osc`. We keep that as the source of truth for content.
 *
 * Marquee behavior: when `primaryTitle` + `oscSuffix` are available, keep the
 * primary fixed and only marquee the OSC segment. Fall back to marquee on the
 * full displayTitle string if structured props are missing.
 */
export function TerminalTitleWithAgent({
  displayTitle,
  primaryTitle,
  oscSuffix,
  toolbarAgent,
  className,
}: TerminalTitleWithAgentProps) {
  const icon =
    toolbarAgent?.iconType === "built-in" ? (
      <AgentIcon registryId={toolbarAgent.id} name={toolbarAgent.label} size={14} />
    ) : toolbarAgent?.iconType === "custom" ? (
      <Bot className="size-3.5 text-muted-foreground" />
    ) : (
      <TerminalIcon className="size-3.5 text-muted-foreground" />
    );

  const primary = (primaryTitle ?? "").trim();
  const osc = (oscSuffix ?? "").trim();

  // Structured path: fixed primary + marquee OSC (requested UX).
  if (primary && osc) {
    return (
      <div className={cn("terminal-title-row", className)} title={`${primary} | ${osc}`}>
        <span className="terminal-title-icon">{icon}</span>
        <span className="terminal-title-primary">{primary}</span>
        <span className="terminal-title-sep" aria-hidden>
          |
        </span>
        <TerminalTitleMarquee text={osc} />
      </div>
    );
  }

  // Fallback identical to pre-marquee: one string (may already contain " | ").
  const text = displayTitle.trim() || primary || osc;
  return (
    <div className={cn("terminal-title-row", className)} title={text}>
      <span className="terminal-title-icon">{icon}</span>
      <TerminalTitleMarquee text={text} />
    </div>
  );
}
