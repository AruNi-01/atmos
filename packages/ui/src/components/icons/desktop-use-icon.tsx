"use client";

import { forwardRef, useCallback, useImperativeHandle } from "react";
import { motion, useAnimate } from "motion/react";
import type { AnimatedIconHandle, AnimatedIconProps } from "./types";

/**
 * Desktop Use icon:
 * - Monitor frame from screen-share (top-right open notch)
 * - mouse-pointer-click arrow on the notch, pointing upper-right (↗)
 * - Hover: light wiggle on the pointer tail
 */
const DesktopUseIcon = forwardRef<AnimatedIconHandle, AnimatedIconProps>(
  (
    {
      size = 24,
      color = "currentColor",
      strokeWidth = 2,
      className = "",
      ...props
    },
    ref,
  ) => {
    const [scope, animate] = useAnimate();

    const start = useCallback(async () => {
      // Tail wiggle around the tip (upper-right notch)
      await animate(
        ".du-pointer",
        { rotate: [0, -10, 8, -5, 0] },
        { duration: 0.45, ease: "easeInOut" },
      );
    }, [animate]);

    const stop = useCallback(async () => {
      await animate(".du-pointer", { rotate: 0 }, { duration: 0.12, ease: "easeOut" });
    }, [animate]);

    useImperativeHandle(ref, () => ({
      startAnimation: start,
      stopAnimation: stop,
    }));

    return (
      <motion.svg
        ref={scope}
        onHoverStart={start}
        onHoverEnd={stop}
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={`cursor-pointer ${className}`}
        {...props}
      >
        {/*
          Screen-share desktop: open at top-right (notch for the control cursor).
        */}
        <path d="M13 3H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-3" />
        <path d="M8 21h8" />
        <path d="M12 17v4" />

        {/*
          Click pointer on the top-right notch, tip pointing ↗ (upper-right).
          mouse-pointer-click is mirrored on X so the tip faces the open corner.
        */}
        <motion.g
          className="du-pointer"
          style={{ transformOrigin: "19px 5px" }}
        >
          {/*
            scale(-s, s) mirrors the lucide pointer (default tip ↖ → tip ↗).
            translate places the tip on the screen-share open corner.
          */}
          <g transform="translate(22.6 0.2) scale(-0.48 0.48)">
            {/* Click ticks (mirrored with body) */}
            <path d="M14 4.1 12 6" opacity={0.9} />
            <path d="m5.1 8-2.9-.8" opacity={0.9} />
            <path d="m6 12-1.9 2" opacity={0.9} />
            <path d="M7.2 2.2 8 5.1" opacity={0.9} />
            {/* Pointer body from mouse-pointer-click */}
            <path d="M9.037 9.69a.498.498 0 0 1 .653-.653l11 4.5a.5.5 0 0 1-.074.949l-4.349 1.041a1 1 0 0 0-.74.739l-1.04 4.35a.5.5 0 0 1-.95.074z" />
          </g>
        </motion.g>
      </motion.svg>
    );
  },
);

DesktopUseIcon.displayName = "DesktopUseIcon";
export default DesktopUseIcon;
