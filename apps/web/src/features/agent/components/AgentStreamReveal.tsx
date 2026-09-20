"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useReducedMotion } from "motion/react";
import { cn } from "@/shared/lib/utils";
import {
  TREE_EASE,
  TREE_LINE_MS,
  TREE_REVEAL_BLUR,
  TREE_REVEAL_FADE_PX,
  TREE_REVEAL_LIFT,
} from "@/features/agent/lib/agent-tree-branch";
import "./agent-stream-reveal.css";

const MASK = `linear-gradient(to bottom, #000 calc(100% - var(--agent-reveal-fade, 0px)), transparent calc(100% + 1px))`;

export function AgentStreamReveal({
  enabled,
  delayMs = 0,
  children,
  className,
}: {
  enabled: boolean;
  delayMs?: number;
  children: ReactNode;
  className?: string;
}) {
  const reduced = useReducedMotion();
  const skip = !enabled || Boolean(reduced);
  const [open, setOpen] = useState(skip);
  const [done, setDone] = useState(skip);
  const animating = !skip && !done;

  useEffect(() => {
    if (open) return;
    let frame1 = 0;
    let frame2 = 0;
    const start = () => {
      frame1 = window.requestAnimationFrame(() => {
        frame2 = window.requestAnimationFrame(() => setOpen(true));
      });
    };
    const timer = delayMs > 0 ? window.setTimeout(start, delayMs) : 0;
    if (delayMs <= 0) start();
    return () => {
      if (timer) window.clearTimeout(timer);
      window.cancelAnimationFrame(frame1);
      window.cancelAnimationFrame(frame2);
    };
  }, [open, delayMs]);

  useEffect(() => {
    if (!open || done) return;
    const timer = window.setTimeout(() => setDone(true), TREE_LINE_MS);
    return () => window.clearTimeout(timer);
  }, [open, done]);

  return (
    <div
      className={cn("min-w-0", animating && "grid overflow-hidden", className)}
      style={animating ? {
        gridTemplateRows: open ? "1fr" : "0fr",
        opacity: open ? 1 : 0,
        filter: open ? "blur(0px)" : TREE_REVEAL_BLUR,
        transform: open ? "translateY(0)" : TREE_REVEAL_LIFT,
        ["--agent-reveal-fade" as string]: open ? "0px" : `${TREE_REVEAL_FADE_PX}px`,
        maskImage: MASK,
        WebkitMaskImage: MASK,
        transition: [
          `grid-template-rows ${TREE_LINE_MS}ms ${TREE_EASE}`,
          `opacity ${TREE_LINE_MS}ms ${TREE_EASE}`,
          `filter ${TREE_LINE_MS}ms ${TREE_EASE}`,
          `transform ${TREE_LINE_MS}ms ${TREE_EASE}`,
          `--agent-reveal-fade ${TREE_LINE_MS}ms ${TREE_EASE}`,
        ].join(", "),
      } : undefined}
    >
      <div className={cn("min-w-0", animating && "min-h-0 overflow-hidden")}>
        {children}
      </div>
    </div>
  );
}
