"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useReducedMotion } from "motion/react";
import { cn } from "@/shared/lib/utils";

const ENTER_MS = 300;
const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

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
    const timer = window.setTimeout(() => setDone(true), ENTER_MS);
    return () => window.clearTimeout(timer);
  }, [open, done]);

  return (
    <div
      className={cn("min-w-0", animating && "grid", className)}
      style={animating ? {
        gridTemplateRows: open ? "1fr" : "0fr",
        opacity: open ? 1 : 0,
        filter: open ? "blur(0px)" : "blur(5px)",
        transform: open ? "translateY(0)" : "translateY(8px)",
        transition: [
          `grid-template-rows ${ENTER_MS}ms ${EASE}`,
          `opacity ${ENTER_MS}ms ${EASE}`,
          `filter ${ENTER_MS}ms ${EASE}`,
          `transform ${ENTER_MS}ms ${EASE}`,
        ].join(", "),
      } : undefined}
    >
      <div className={cn("min-w-0", animating && "min-h-0 overflow-hidden")}>
        {children}
      </div>
    </div>
  );
}
