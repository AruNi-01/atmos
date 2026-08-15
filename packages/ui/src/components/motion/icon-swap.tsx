"use client";

import { AnimatePresence, motion, useReducedMotion, type HTMLMotionProps } from "motion/react";
import type { ReactNode } from "react";

/** Amicro IconSwap — popLayout so the incoming glyph takes the slot immediately. */
export function IconSwap({ children }: { children: ReactNode }) {
  return (
    <AnimatePresence mode="popLayout" initial={false}>
      {children}
    </AnimatePresence>
  );
}

const SWAP = {
  type: "spring",
  duration: 0.3,
  bounce: 0,
} as const;

export function IconSwapItem({
  children,
  className,
  ...props
}: HTMLMotionProps<"span">) {
  const reduce = useReducedMotion();
  return (
    <motion.span
      initial={
        reduce ? false : { opacity: 0, scale: 0.25, filter: "blur(4px)" }
      }
      animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
      exit={reduce ? undefined : { opacity: 0, scale: 0.25, filter: "blur(4px)" }}
      transition={reduce ? { duration: 0 } : SWAP}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
      }}
      className={className}
      {...props}
    >
      {children}
    </motion.span>
  );
}
