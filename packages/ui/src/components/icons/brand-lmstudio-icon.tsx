"use client";

import type { Variants } from "motion/react";
import { motion, useAnimation } from "motion/react";
import type { HTMLAttributes } from "react";
import { forwardRef, useCallback, useImperativeHandle, useRef } from "react";

import { cn } from "../../lib/utils";
import type { AnimatedIconHandle } from "./types";

interface BrandLmStudioIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number;
  color?: string;
}

const LINE_PATHS = [
  "M2.84 2a1.273 1.273 0 100 2.547h10.287a1.274 1.274 0 000-2.547H2.84z",
  "M7.935 5.33a1.273 1.273 0 000 2.548H18.22a1.274 1.274 0 000-2.547H7.935z",
  "M3.624 9.935c0-.704.57-1.274 1.274-1.274h10.286a1.273 1.273 0 010 2.547H4.898c-.703 0-1.274-.57-1.274-1.273z",
  "M1.273 12.188a1.273 1.273 0 100 2.547H11.56a1.274 1.274 0 000-2.547H1.273z",
  "M3.624 16.792c0-.704.57-1.274 1.274-1.274h10.286a1.273 1.273 0 110 2.547H4.898c-.703 0-1.274-.57-1.274-1.273z",
  "M13.029 18.849a1.273 1.273 0 100 2.547h5.78a1.273 1.273 0 100-2.547h-5.78z",
];

const LINE_VARIANTS: Variants = {
  normal: {
    scaleX: 1,
    transition: { duration: 0.2, ease: "easeOut" },
  },
  animate: (i: number) => {
    const strength = 1 + i * 0.06;
    return {
      scaleX: [1, strength, 0.9, strength * 0.95, 1],
      transition: {
        duration: 1.4,
        delay: i * 0.08,
        ease: "easeInOut",
        repeat: Infinity,
      },
    };
  },
};

const BrandLmStudioIcon = forwardRef<AnimatedIconHandle, BrandLmStudioIconProps>(
  (
    { onMouseEnter, onMouseLeave, className, size = 24, color = "currentColor", ...props },
    ref,
  ) => {
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
          void controls.start("animate");
        }
      },
      [controls, onMouseEnter],
    );

    const handleMouseLeave = useCallback(
      (e: React.MouseEvent<HTMLDivElement>) => {
        if (isControlledRef.current) {
          onMouseLeave?.(e);
        } else {
          void controls.start("normal");
        }
      },
      [controls, onMouseLeave],
    );

    return (
      <div
        className={cn("inline-flex", className)}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        {...props}
      >
        <svg
          fill={color}
          height={size}
          viewBox="0 0 24 24"
          width={size}
          xmlns="http://www.w3.org/2000/svg"
        >
          {LINE_PATHS.map((d, i) => (
            <motion.path
              key={d}
              animate={controls}
              custom={i}
              d={d}
              initial="normal"
              style={{ originX: 0.5, originY: 0.5, transformBox: "fill-box" }}
              variants={LINE_VARIANTS}
            />
          ))}
        </svg>
      </div>
    );
  },
);

BrandLmStudioIcon.displayName = "BrandLmStudioIcon";
export default BrandLmStudioIcon;
