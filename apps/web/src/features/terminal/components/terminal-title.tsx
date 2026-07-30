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
 *
 * OSC titles often update rapidly while an agent is running. We always paint the
 * latest text immediately, but only remount/restart the scroll after the string
 * has been stable briefly — otherwise the animation is stuck in its start delay.
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
  // Bump to remount the animating node at translateX(0).
  const [animKey, setAnimKey] = useState(0);
  const lastRestartAtRef = useRef(0);
  const isFirstTextRef = useRef(true);

  useEffect(() => {
    // Skip the initial mount — nothing to "restart" yet.
    if (isFirstTextRef.current) {
      isFirstTextRef.current = false;
      return;
    }

    // Immediate restart if we haven't just restarted; otherwise wait for a quiet
    // window. Agent OSC can update many times per second and would otherwise
    // keep the marquee stuck in its lead-in delay forever.
    const RESTART_GAP_MS = 450;
    const elapsed = Date.now() - lastRestartAtRef.current;
    if (elapsed >= RESTART_GAP_MS) {
      lastRestartAtRef.current = Date.now();
      setAnimKey((k) => k + 1);
      return;
    }

    const timer = window.setTimeout(() => {
      lastRestartAtRef.current = Date.now();
      setAnimKey((k) => k + 1);
    }, RESTART_GAP_MS - elapsed);
    return () => window.clearTimeout(timer);
  }, [text]);

  useEffect(() => {
    const container = containerRef.current;
    const content = contentRef.current;
    if (!container || !content) return;

    const measure = () => {
      // transform does not affect layout metrics; do not reset it on resize
      // (toolbar expand / agent-status mount) or a running marquee is interrupted.
      const overflow = Math.max(0, content.scrollWidth - container.clientWidth);
      setOverflowPx((prev) => (prev === overflow ? prev : overflow));
      container.style.setProperty("--marquee-distance", `${overflow}px`);
      const durationSec = overflow > 0 ? Math.min(28, Math.max(6, overflow / 40)) : 0;
      container.style.setProperty("--marquee-duration", `${durationSec}s`);
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
        key={animKey}
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
