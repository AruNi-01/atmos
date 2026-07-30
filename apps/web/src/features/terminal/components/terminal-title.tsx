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
 * Only animates when the content is wider than the available slot; short titles
 * always stay fully visible (no 0-width flex collapse).
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
      // Use offset/scroll widths so we measure real paint size, not flex guess.
      const overflow = Math.max(0, content.scrollWidth - container.clientWidth);
      setOverflowPx(overflow);
      container.style.setProperty("--marquee-distance", `${overflow}px`);
      const durationSec = overflow > 0 ? Math.min(28, Math.max(6, overflow / 40)) : 0;
      container.style.setProperty("--marquee-duration", `${durationSec}s`);
    };

    measure();
    // Re-measure after layout settles (flex parents often report 0 on first paint).
    const raf = requestAnimationFrame(() => measure());
    const ro = new ResizeObserver(measure);
    ro.observe(container);
    ro.observe(content);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
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

  // Fallback: if callers only pass a combined displayTitle ("A | B"), still show B.
  const parsed =
    !osc && primary.includes(" | ")
      ? (() => {
          const idx = primary.indexOf(" | ");
          return {
            left: primary.slice(0, idx).trim(),
            right: primary.slice(idx + 3).trim(),
          };
        })()
      : { left: primary, right: osc };

  const left = parsed.left || primary;
  const right = parsed.right;

  return (
    <div className={cn("terminal-title-row", className)}>
      <span className="terminal-title-icon">
        {toolbarAgent?.iconType === "built-in" ? (
          <AgentIcon registryId={toolbarAgent.id} name={toolbarAgent.label} size={14} />
        ) : toolbarAgent?.iconType === "custom" ? (
          <Bot className="size-3.5 text-muted-foreground" />
        ) : (
          <TerminalIcon className="size-3.5 text-muted-foreground" />
        )}
      </span>
      <span className={cn("terminal-title-primary", right && "has-osc")}>{left}</span>
      {right ? (
        <>
          <span className="terminal-title-sep" aria-hidden>
            |
          </span>
          <TerminalTitleMarquee text={right} className="terminal-title-osc" />
        </>
      ) : null}
    </div>
  );
}
