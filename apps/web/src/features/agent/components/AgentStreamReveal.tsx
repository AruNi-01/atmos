"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useReducedMotion } from "motion/react";
import { cn } from "@/shared/lib/utils";

const ENTER_MS = 300;
const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

export function AgentStreamReveal({
  enabled,
  children,
  className,
}: {
  enabled: boolean;
  children: ReactNode;
  className?: string;
}) {
  const reduced = useReducedMotion();
  const skip = !enabled || Boolean(reduced);
  const [open, setOpen] = useState(skip);
  const [done, setDone] = useState(skip);

  useEffect(() => {
    if (open) return;
    const frame = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => setOpen(true));
    });
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  useEffect(() => {
    if (!open || done) return;
    const timer = window.setTimeout(() => setDone(true), ENTER_MS);
    return () => window.clearTimeout(timer);
  }, [open, done]);

  if (done) return <>{children}</>;

  return (
    <div
      className={cn("grid min-w-0", className)}
      style={{
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
      }}
    >
      <div className="min-h-0 overflow-hidden">{children}</div>
    </div>
  );
}
