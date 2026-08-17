"use client";

import type { Variants } from "motion/react";
import { motion, useAnimation } from "motion/react";
import type { HTMLAttributes } from "react";
import { forwardRef, useCallback, useImperativeHandle, useRef } from "react";

import { cn } from "@/lib/utils";

export interface PencilRulerIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

interface PencilRulerIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number;
}

const RULER_VARIANTS: Variants = {
  normal: { rotate: 0, x: 0, y: 0 },
  animate: {
    rotate: [0, -6, 4, 0],
    transition: { duration: 0.55, ease: "easeInOut" },
  },
};

const PENCIL_VARIANTS: Variants = {
  normal: { x: 0, y: 0, rotate: 0 },
  animate: {
    x: [0, 1.2, -0.6, 0],
    y: [0, -1.4, 0.8, 0],
    rotate: [0, -8, 5, 0],
    transition: { duration: 0.55, ease: "easeInOut" },
  },
};

const TICK_VARIANTS: Variants = {
  normal: { opacity: 1 },
  animate: (i: number) => ({
    opacity: [1, 0.25, 1],
    transition: { delay: 0.08 * i, duration: 0.35, ease: "easeInOut" },
  }),
};

const PencilRulerIcon = forwardRef<PencilRulerIconHandle, PencilRulerIconProps>(
  ({ onMouseEnter, onMouseLeave, className, size = 28, ...props }, ref) => {
    const controls = useAnimation();
    const isControlledRef = useRef(false);

    useImperativeHandle(ref, () => {
      isControlledRef.current = true;
      return {
        startAnimation: () => controls.start("animate"),
        stopAnimation: () => controls.start("normal"),
      };
    });

    const handleMouseEnter = useCallback(
      (e: React.MouseEvent<HTMLDivElement>) => {
        if (isControlledRef.current) {
          onMouseEnter?.(e);
        } else {
          controls.start("animate");
        }
      },
      [controls, onMouseEnter],
    );

    const handleMouseLeave = useCallback(
      (e: React.MouseEvent<HTMLDivElement>) => {
        if (isControlledRef.current) {
          onMouseLeave?.(e);
        } else {
          controls.start("normal");
        }
      },
      [controls, onMouseLeave],
    );

    return (
      <div
        className={cn(className)}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        {...props}
      >
        <svg
          fill="none"
          height={size}
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          viewBox="0 0 24 24"
          width={size}
          xmlns="http://www.w3.org/2000/svg"
        >
          <motion.g animate={controls} initial="normal" variants={RULER_VARIANTS}>
            <path d="M13 7 8.7 2.7a2.41 2.41 0 0 0-3.4 0L2.7 5.3a2.41 2.41 0 0 0 0 3.4L7 13" />
            <path d="m17 11 4.3 4.3c.94.94.94 2.46 0 3.4l-2.6 2.6c-.94.94-2.46.94-3.4 0L11 17" />
            <motion.path animate={controls} custom={0} d="m8 6 2-2" initial="normal" variants={TICK_VARIANTS} />
            <motion.path animate={controls} custom={1} d="m18 16 2-2" initial="normal" variants={TICK_VARIANTS} />
          </motion.g>
          <motion.g animate={controls} initial="normal" variants={PENCIL_VARIANTS}>
            <path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" />
            <path d="m15 5 4 4" />
          </motion.g>
        </svg>
      </div>
    );
  },
);

PencilRulerIcon.displayName = "PencilRulerIcon";

export { PencilRulerIcon };
