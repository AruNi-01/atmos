"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

const ease = [0.22, 1, 0.36, 1] as const;
const duration = 0.24;

/**
 * The leaving row stays in flow and its slot closes on the same tween as the
 * fade, so neighbors move with it instead of catching up afterwards.
 */
export function SidebarMotionScope({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={className}>{children}</div>;
}

export function SidebarMotionList({ children }: { children: ReactNode }) {
  return <AnimatePresence initial={false}>{children}</AnimatePresence>;
}

export function SidebarMotionItem({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const box = className ? `min-w-0 overflow-hidden ${className}` : "min-w-0 overflow-hidden";
  if (reduce) {
    return <div className={box}>{children}</div>;
  }
  return (
    <motion.div
      className={box}
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration, ease }}
    >
      {children}
    </motion.div>
  );
}
