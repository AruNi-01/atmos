import { forwardRef, useCallback, useImperativeHandle } from "react";
import { motion, useAnimate } from "motion/react";
import type { AnimatedIconHandle, AnimatedIconProps } from "./types";

const ComputerIcon = forwardRef<AnimatedIconHandle, AnimatedIconProps>(
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
      await Promise.all([
        animate(
          ".computer-line-1",
          { pathLength: [0, 1], opacity: [0.4, 1] },
          { duration: 0.25, ease: "easeOut" },
        ),
        animate(
          ".computer-line-2",
          { pathLength: [0, 1], opacity: [0.4, 1] },
          { duration: 0.25, delay: 0.08, ease: "easeOut" },
        ),
        animate(
          ".computer-dot",
          { opacity: [0.3, 1, 0.6, 1] },
          { duration: 0.5, ease: "easeInOut" },
        ),
        animate(
          ".computer-stand",
          { y: [0, 0.5, 0] },
          { duration: 0.35, ease: "easeInOut" },
        ),
      ]);
    }, [animate]);

    const stop = useCallback(async () => {
      await Promise.all([
        animate(
          ".computer-line-1, .computer-line-2",
          { pathLength: 1, opacity: 1 },
          { duration: 0.15, ease: "easeOut" },
        ),
        animate(".computer-dot", { opacity: 1 }, { duration: 0.15 }),
        animate(".computer-stand", { y: 0 }, { duration: 0.15 }),
      ]);
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
        <path stroke="none" d="M0 0h24v24H0z" fill="none" />
        <motion.rect
          className="computer-screen"
          x="3"
          y="4"
          width="18"
          height="12"
          rx="2"
        />
        <motion.path className="computer-line-1" d="M7 8h10" />
        <motion.path className="computer-line-2" d="M7 11h7" />
        <motion.circle
          className="computer-dot"
          cx="17"
          cy="8"
          r="0.75"
          fill={color}
          stroke="none"
        />
        <motion.path className="computer-base" d="M12 16v3" />
        <motion.path className="computer-stand" d="M8 20h8" />
      </motion.svg>
    );
  },
);

ComputerIcon.displayName = "ComputerIcon";
export default ComputerIcon;
