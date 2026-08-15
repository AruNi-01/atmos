"use client";

import type { Variants } from "motion/react";
import { motion, useAnimation } from "motion/react";
import type { HTMLAttributes } from "react";
import { forwardRef, useCallback, useImperativeHandle, useRef } from "react";

import { cn } from "@/lib/utils";

export interface ChartColumnBigIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

interface ChartColumnBigIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number;
}

const BAR_VARIANTS: Variants = {
  normal: { scaleY: 1 },
  animate: (i: number) => ({
    scaleY: [0.35, 1],
    transition: {
      delay: i * 0.08,
      duration: 0.38,
      ease: [0.16, 1, 0.3, 1],
    },
  }),
};

const ChartColumnBigIcon = forwardRef<
  ChartColumnBigIconHandle,
  ChartColumnBigIconProps
>(({ onMouseEnter, onMouseLeave, className, size = 28, ...props }, ref) => {
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
    [controls, onMouseEnter]
  );

  const handleMouseLeave = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (isControlledRef.current) {
        onMouseLeave?.(e);
      } else {
        controls.start("normal");
      }
    },
    [controls, onMouseLeave]
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
        <path d="M3 3v16a2 2 0 0 0 2 2h16" />
        <motion.rect
          animate={controls}
          custom={0}
          height="9"
          initial="normal"
          rx="1"
          style={{ originX: 0.5, originY: 1 }}
          variants={BAR_VARIANTS}
          width="4"
          x="7"
          y="8"
        />
        <motion.rect
          animate={controls}
          custom={1}
          height="12"
          initial="normal"
          rx="1"
          style={{ originX: 0.5, originY: 1 }}
          variants={BAR_VARIANTS}
          width="4"
          x="15"
          y="5"
        />
      </svg>
    </div>
  );
});

ChartColumnBigIcon.displayName = "ChartColumnBigIcon";

export { ChartColumnBigIcon };
