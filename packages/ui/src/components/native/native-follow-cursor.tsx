"use client";

import * as React from "react";
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
} from "motion/react";

import { cn } from "../../lib/utils";
import { TextMorph } from "../ui/text-morph";

type CursorPoint = {
  x: number;
  y: number;
};

export type NativeFollowCursorProps = {
  active?: boolean;
  label?: string;
  point?: CursorPoint | null;
  offset?: CursorPoint;
  className?: string;
};

const spring = {
  stiffness: 240,
  damping: 30,
  mass: 0.35,
};

export function NativeFollowCursor({
  active = true,
  label = "",
  point,
  offset = { x: 16, y: 18 },
  className,
}: NativeFollowCursorProps) {
  const shouldReduceMotion = useReducedMotion();
  const targetX = useMotionValue(point ? point.x + offset.x : -9999);
  const targetY = useMotionValue(point ? point.y + offset.y : -9999);
  const x = useSpring(targetX, spring);
  const y = useSpring(targetY, spring);

  React.useEffect(() => {
    if (!active || !label) return;
    if (point) {
      targetX.set(point.x + offset.x);
      targetY.set(point.y + offset.y);
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      targetX.set(event.clientX + offset.x);
      targetY.set(event.clientY + offset.y);
    };

    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    return () => window.removeEventListener("pointermove", handlePointerMove);
  }, [active, label, offset.x, offset.y, point, targetX, targetY]);

  React.useEffect(() => {
    if (!active || !label || !point) return;
    targetX.set(point.x + offset.x);
    targetY.set(point.y + offset.y);
  }, [active, label, offset.x, offset.y, point?.x, point?.y, targetX, targetY]);

  return (
    <AnimatePresence>
      {active && label ? (
        <motion.div
          aria-hidden="true"
          className={cn(
            "pointer-events-none fixed left-0 top-0 z-[2147483646] max-w-[min(360px,calc(100vw-24px))] overflow-hidden rounded-full border border-white/10 bg-zinc-950/88 px-3 py-1.5 font-mono text-xs font-medium leading-none text-zinc-50 shadow-[0_14px_34px_rgba(0,0,0,0.28)] backdrop-blur-xl",
            className,
          )}
          style={{
            x: shouldReduceMotion ? targetX : x,
            y: shouldReduceMotion ? targetY : y,
          }}
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.96 }}
          transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
        >
          <TextMorph as="span" className="max-w-full truncate">
            {label}
          </TextMorph>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
