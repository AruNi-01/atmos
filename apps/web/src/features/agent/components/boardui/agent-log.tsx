"use client";

import { useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { TextShimmer } from "@workspace/ui";
import { cn } from "@/shared/lib/utils";

/**
 * Tree guide and row reveal adapted from BoardUI Agent Log
 * (the motion shared by Task List and Web Search).
 * Color and type use Atmos tokens. The demo ticker is not ported:
 * chat rows mount from real tool events.
 */

export const SOFT_EASE = [0.22, 1, 0.36, 1] as const;

const REVEAL_FADE_VAR = "--bui-reveal-fade";

const REVEAL_GRADIENT = `linear-gradient(to bottom, #000 calc(100% - var(${REVEAL_FADE_VAR}, 0px)), transparent calc(100% + 1px))`;

const REVEAL_MASK: CSSProperties = {
  WebkitMaskImage: REVEAL_GRADIENT,
  maskImage: REVEAL_GRADIENT,
};

export const UNIT_INITIAL = {
  opacity: 0,
  height: 0,
  y: 4,
  filter: "blur(6px)",
  [REVEAL_FADE_VAR]: "22px",
};

export const UNIT_ANIMATE = {
  opacity: 1,
  height: "auto",
  y: 0,
  filter: "blur(0px)",
  [REVEAL_FADE_VAR]: "0px",
};

export const UNIT_TRANSITION = {
  height: { duration: 0.38, ease: SOFT_EASE },
  opacity: { duration: 0.42, ease: SOFT_EASE },
  filter: { duration: 0.42, ease: SOFT_EASE },
  y: { duration: 0.42, ease: SOFT_EASE },
  [REVEAL_FADE_VAR]: { duration: 0.44, ease: SOFT_EASE },
};

export function useRevealMask(skip: boolean) {
  const [revealing, setRevealing] = useState(!skip);
  return {
    style: revealing ? REVEAL_MASK : undefined,
    onAnimationComplete: () => setRevealing(false),
  };
}

export function ShimmerText({ children }: { children: string }) {
  return (
    <TextShimmer as="span" duration={1.6} className="text-[13px] leading-5">
      {children}
    </TextShimmer>
  );
}

const BRANCH_Y = 14;
const BRANCH_RADIUS = 6;
const BRANCH_WIDTH = 12;
const BRANCH_PATH = `M0.5 0 V${BRANCH_Y - BRANCH_RADIUS} Q0.5 ${BRANCH_Y} ${0.5 + BRANCH_RADIUS} ${BRANCH_Y} H11.5`;

/**
 * The elbow and the trunk share pixels, and one row's trunk meets the next
 * row's path. Translucent ink composites twice at those joints and reads
 * darker. Mix once into the page background so an overlap stays one tone.
 */
const GUIDE_INK = "color-mix(in srgb, var(--muted-foreground) 45%, var(--background))";

const TAIL_TRANSITION = { duration: 0.12, ease: "linear" as const, delay: 0 };

const branchTransition = (first: boolean) => ({
  duration: 0.14,
  ease: "linear" as const,
  delay: first ? 0 : 0.12,
});

export function RowConnector({
  first,
  last,
  skip,
}: {
  first: boolean;
  last: boolean;
  skip: boolean;
}) {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute inset-y-0 start-0 w-3"
      style={{ color: GUIDE_INK }}
    >
      <svg
        width={BRANCH_WIDTH}
        height={BRANCH_Y + 1}
        viewBox={`0 0 ${BRANCH_WIDTH} ${BRANCH_Y + 1}`}
        fill="none"
        className="absolute top-0 start-0 rtl:-scale-x-100"
      >
        <motion.path
          d={BRANCH_PATH}
          stroke="currentColor"
          strokeWidth="1"
          initial={skip ? false : { pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={branchTransition(first)}
        />
      </svg>
      {!last ? (
        <motion.span
          className="absolute start-0 w-px origin-top bg-current"
          style={{ top: BRANCH_Y - BRANCH_RADIUS, bottom: 0 }}
          initial={skip ? false : { scaleY: 0 }}
          animate={{ scaleY: 1 }}
          transition={TAIL_TRANSITION}
        />
      ) : null}
    </span>
  );
}

export function GuideBridge({
  height,
  offset = 8,
  skip,
}: {
  height: number;
  offset?: number;
  skip: boolean;
}) {
  return (
    <motion.span
      aria-hidden
      className="pointer-events-none absolute w-px origin-top bg-current"
      style={{ top: -height, height, insetInlineStart: offset, color: GUIDE_INK }}
      initial={skip ? false : { scaleY: 0 }}
      animate={{ scaleY: 1 }}
      transition={TAIL_TRANSITION}
    />
  );
}

export function useLogMotion() {
  return useReducedMotion() ?? false;
}

export function LogRow({
  first,
  last,
  instant = false,
  className,
  children,
}: {
  first: boolean;
  last: boolean;
  /** Already-seen rows mount in place. New rows blur and lift in. */
  instant?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const skip = useLogMotion() || instant;
  const mask = useRevealMask(skip);
  return (
    <motion.li
      initial={skip ? false : UNIT_INITIAL}
      animate={UNIT_ANIMATE}
      transition={UNIT_TRANSITION}
      {...mask}
      className={cn("relative overflow-hidden ps-4", className)}
    >
      <RowConnector first={first} last={last} skip={skip} />
      {children}
    </motion.li>
  );
}
