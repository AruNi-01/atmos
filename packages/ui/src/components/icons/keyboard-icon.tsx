import { forwardRef, useImperativeHandle } from "react";
import type { AnimatedIconHandle, AnimatedIconProps } from "./types";
import { motion, useAnimate } from "motion/react";

const KeyboardIcon = forwardRef<AnimatedIconHandle, AnimatedIconProps>(
  (
    { size = 40, className = "", strokeWidth = 2, color = "currentColor" },
    ref,
  ) => {
    const [scope, animate] = useAnimate();

    const start = async () => {
      animate(
        ".k1,.k2,.k3,.k4,.k5,.k6,.k7,.k8",
        { opacity: [1, 0.2, 1] },
        {
          duration: 1.2,
          times: [0, 0.5, 1],
          delay: (i: number) => i * 0.15 * Math.random(),
          repeat: 1,
          repeatType: "reverse",
        },
      );
    };

    const stop = async () => {
      animate(
        ".k1,.k2,.k3,.k4,.k5,.k6,.k7,.k8",
        { opacity: 1 },
        { duration: 0.15 },
      );
    };

    useImperativeHandle(ref, () => {
      return {
        startAnimation: start,
        stopAnimation: stop,
      };
    });

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
        stroke="currentColor"
        color={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={`cursor-pointer ${className}`}
      >
        <rect width="20" height="16" x="2" y="4" rx="2" />
        <motion.path className="k1" d="M10 8h.01" />
        <motion.path className="k2" d="M12 12h.01" />
        <motion.path className="k3" d="M14 8h.01" />
        <motion.path className="k4" d="M16 12h.01" />
        <motion.path className="k5" d="M18 8h.01" />
        <motion.path className="k6" d="M6 8h.01" />
        <motion.path className="k7" d="M7 16h10" />
        <motion.path className="k8" d="M8 12h.01" />
      </motion.svg>
    );
  },
);

KeyboardIcon.displayName = "KeyboardIcon";

export default KeyboardIcon;
