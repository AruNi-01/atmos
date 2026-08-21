"use client";

import type { Variants } from "motion/react";
import { motion, useAnimation } from "motion/react";
import type { HTMLAttributes } from "react";
import { forwardRef, useCallback, useImperativeHandle, useRef } from "react";

import { cn } from "@/lib/utils";

export interface ListTodoIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

interface ListTodoIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number;
}

const CHECK_VARIANTS: Variants = {
  normal: { pathLength: 1, opacity: 1 },
  animate: {
    pathLength: [0, 1],
    opacity: [0, 1],
    transition: { duration: 0.35, ease: "easeOut" },
  },
};

const LINE_VARIANTS: Variants = {
  normal: { opacity: 1, x: 0 },
  animate: (i: number) => ({
    opacity: [0.35, 1],
    x: [2, 0],
    transition: { delay: 0.08 * i, duration: 0.28, ease: "easeOut" },
  }),
};

const ListTodoIcon = forwardRef<ListTodoIconHandle, ListTodoIconProps>(
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
          <rect height="6" rx="1" width="6" x="3" y="4" />
          <motion.path
            animate={controls}
            d="m3 17 2 2 4-4"
            initial="normal"
            variants={CHECK_VARIANTS}
          />
          {["M13 5h8", "M13 12h8", "M13 19h8"].map((d, index) => (
            <motion.path
              animate={controls}
              custom={index}
              d={d}
              initial="normal"
              key={d}
              variants={LINE_VARIANTS}
            />
          ))}
        </svg>
      </div>
    );
  }
);

ListTodoIcon.displayName = "ListTodoIcon";

export { ListTodoIcon };
