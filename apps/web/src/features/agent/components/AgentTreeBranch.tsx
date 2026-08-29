"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useReducedMotion } from "motion/react";

const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";
const RADIUS = 6;
const ARM = 10;
const MID_Y = 12;

export function AgentTreeBranch({
  isLast,
  isFirst = false,
  animate = false,
  children,
}: {
  isLast: boolean;
  isFirst?: boolean;
  animate?: boolean;
  children: ReactNode;
}) {
  const reduced = useReducedMotion();
  const skip = !animate || Boolean(reduced);
  const [drawn, setDrawn] = useState(skip);

  useEffect(() => {
    if (drawn) return;
    const frame = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => setDrawn(true));
    });
    return () => window.cancelAnimationFrame(frame);
  }, [drawn]);

  return (
    <div className="relative flex min-w-0">
      <div className="relative w-7 shrink-0 self-stretch overflow-visible" aria-hidden="true">
        {!isLast ? (
          <span
            className="absolute bottom-0 left-2 w-px bg-background"
            style={{
              top: MID_Y - RADIUS,
              backgroundImage: "linear-gradient(var(--border), var(--border))",
              transform: drawn ? "scaleY(1)" : "scaleY(0)",
              transformOrigin: "top",
              transition: `transform 220ms ${EASE}`,
            }}
          />
        ) : null}
        <span
          className="absolute left-2 z-[1] box-border border-border bg-background"
          style={{
            top: isFirst ? -4 : 0,
            width: RADIUS + ARM,
            height: isFirst ? MID_Y + 4 : MID_Y,
            borderLeftWidth: 1,
            borderBottomWidth: 1,
            borderBottomLeftRadius: RADIUS,
            opacity: drawn ? 1 : 0,
            transition: `opacity 160ms ${EASE}`,
          }}
        />
      </div>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
