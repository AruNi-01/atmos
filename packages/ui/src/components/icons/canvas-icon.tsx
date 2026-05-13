import { forwardRef, useImperativeHandle } from "react";
import type { AnimatedIconHandle, AnimatedIconProps } from "./types";
import { motion, useAnimate } from "motion/react";

const CanvasIcon = forwardRef<AnimatedIconHandle, AnimatedIconProps>(
  (
    { size = 40, className = "", strokeWidth = 2, color = "currentColor" },
    ref,
  ) => {
    const [scope, animate] = useAnimate();

    const start = async () => {
      animate(".pencil", { x: 3, y: -3, rotate: -15 }, { duration: 0.3, ease: "easeInOut" });
      animate(".line-1", { strokeWidth: 3 }, { duration: 0.2, ease: "easeInOut" });
      animate(".line-2", { strokeWidth: 3 }, { duration: 0.2, ease: "easeInOut", delay: 0.1 });
    };

    const stop = async () => {
      animate(".pencil", { x: 0, y: 0, rotate: 0 }, { duration: 0.2, ease: "easeInOut" });
      animate(".line-1, .line-2", { strokeWidth: 2 }, { duration: 0.2, ease: "easeInOut" });
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
        initial={{ x: 0, y: 0 }}
      >
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <motion.line className="line-1" initial={{ strokeWidth: 2 }} x1="7" y1="7" x2="17" y2="7" />
        <motion.line className="line-2" initial={{ strokeWidth: 2 }} x1="7" y1="12" x2="13" y2="12" />
        <motion.g className="pencil" initial={{ x: 0, y: 0, rotate: 0 }}>
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
          <path d="m15 3 3 3" />
          <path d="m18 6-5 5" />
          <path d="m13 11-2 2" />
        </motion.g>
      </motion.svg>
    );
  },
);

CanvasIcon.displayName = "CanvasIcon";

export default CanvasIcon;
