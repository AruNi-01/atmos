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
 *
 * Important: never thrash CSS animation properties on every ResizeObserver tick.
 * Updating `--marquee-duration` restarts the animation, which looks like the title
 * is "constantly updating" and prevents the marquee from actually scrolling.
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
  // Bump to remount the animating node at translateX(0) after a stable text change.
  const [animKey, setAnimKey] = useState(0);
  const lastAnimatedTextRef = useRef(text);
  const lastDistanceRef = useRef(-1);
  const lastDurationRef = useRef(-1);
  const restartTimerRef = useRef<number | null>(null);

  useEffect(() => {
    // Identical string → no restart (also covers parent re-renders with same OSC).
    if (text === lastAnimatedTextRef.current) return;

    // Debounce: only restart after the title stops changing. Agent CLIs can
    // re-emit OSC many times per second; immediate remount pins the marquee at
    // animation-delay forever.
    const STABLE_MS = 700;
    if (restartTimerRef.current != null) {
      window.clearTimeout(restartTimerRef.current);
    }
    restartTimerRef.current = window.setTimeout(() => {
      restartTimerRef.current = null;
      lastAnimatedTextRef.current = text;
      lastDistanceRef.current = -1;
      lastDurationRef.current = -1;
      setAnimKey((k) => k + 1);
    }, STABLE_MS);

    return () => {
      if (restartTimerRef.current != null) {
        window.clearTimeout(restartTimerRef.current);
        restartTimerRef.current = null;
      }
    };
  }, [text]);

  useEffect(() => {
    const container = containerRef.current;
    const content = contentRef.current;
    if (!container || !content) return;

    const measure = () => {
      // transform does not affect layout metrics; do not reset it on resize
      // (toolbar expand / agent-status mount) or a running marquee is interrupted.
      const overflow = Math.max(0, Math.round(content.scrollWidth - container.clientWidth));
      setOverflowPx((prev) => (prev === overflow ? prev : overflow));

      // Only write CSS vars when values actually change — assigning
      // `--marquee-duration` restarts the CSS animation even for tiny float noise.
      if (overflow !== lastDistanceRef.current) {
        lastDistanceRef.current = overflow;
        container.style.setProperty("--marquee-distance", `${overflow}px`);
      }
      const durationSec =
        overflow > 0 ? Math.min(28, Math.max(6, Math.round(overflow / 40))) : 0;
      if (durationSec !== lastDurationRef.current) {
        lastDurationRef.current = durationSec;
        container.style.setProperty("--marquee-duration", `${durationSec}s`);
      }
    };

    measure();
    const raf = requestAnimationFrame(measure);
    // Coalesce resize storms (toolbar expand/collapse) onto the next frame.
    let roRaf = 0;
    const ro = new ResizeObserver(() => {
      if (roRaf) cancelAnimationFrame(roRaf);
      roRaf = requestAnimationFrame(measure);
    });
    ro.observe(container);
    ro.observe(content);
    return () => {
      cancelAnimationFrame(raf);
      if (roRaf) cancelAnimationFrame(roRaf);
      ro.disconnect();
    };
  }, [text, animKey, overflowPx > 0]);

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
  // Agent name is omitted when OSC is present → primary empty → icon + OSC (no ` | `).
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

  if (!primary && osc) {
    return (
      <div className={cn("terminal-title-row", className)} title={osc}>
        <span className="terminal-title-icon">{icon}</span>
        <TerminalTitleMarquee text={osc} />
      </div>
    );
  }

  // Fallback identical to pre-marquee: one string (may already contain " | ").
  // Icon-only agent identity still shows the agent name so the toolbar is not empty.
  const text = displayTitle.trim() || primary || osc || toolbarAgent?.label?.trim() || "";
  return (
    <div className={cn("terminal-title-row", className)} title={text}>
      <span className="terminal-title-icon">{icon}</span>
      {text ? <TerminalTitleMarquee text={text} /> : null}
    </div>
  );
}
