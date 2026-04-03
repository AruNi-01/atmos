import { forwardRef, useImperativeHandle } from "react";
import { motion, useAnimate } from "motion/react";

import type { AnimatedIconHandle, AnimatedIconProps } from "./types";

const ArrowNarrowDownDashedIcon = forwardRef<
  AnimatedIconHandle,
  AnimatedIconProps
>(
  (
    { size = 24, color = "currentColor", strokeWidth = 2, className = "" },
    ref,
  ) => {
    const [scope, animate] = useAnimate();

    const start = async () => {
      await animate(
        ".arrow-group",
        { y: [0, 4, 0] },
        { duration: 0.5, ease: "easeInOut" },
      );
    };

    const stop = () => {
      animate(".arrow-group", { y: 0 }, { duration: 0.2, ease: "easeOut" });
    };

    useImperativeHandle(ref, () => ({
      startAnimation: start,
      stopAnimation: stop,
    }));

    return (
      <motion.div
        ref={scope}
        onHoverStart={start}
        onHoverEnd={stop}
        className={`inline-flex cursor-pointer items-center justify-center ${className}`}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <motion.g className="arrow-group">
            <path d="M12 5v.5" />
            <path d="M12 8.5v1.5" />
            <path d="M12 13v6" />
            <path d="M16 15l-4 4" />
            <path d="M8 15l4 4" />
          </motion.g>
        </svg>
      </motion.div>
    );
  },
);

ArrowNarrowDownDashedIcon.displayName = "ArrowNarrowDownDashedIcon";

export default ArrowNarrowDownDashedIcon;
