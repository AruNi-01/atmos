import { forwardRef, useCallback, useImperativeHandle } from "react";
import { Presentation } from "lucide-react";
import type { AnimatedIconHandle, AnimatedIconProps } from "./types";
import { motion, useAnimate } from "motion/react";

const CanvasIcon = forwardRef<AnimatedIconHandle, AnimatedIconProps>(
  (
    { size = 40, className = "", strokeWidth = 2, color = "currentColor" },
    ref,
  ) => {
    const [scope, animate] = useAnimate();

    const start = useCallback(async () => {
      animate(
        ".presentation-icon",
        { y: [-0.2, -0.8, 0] },
        { duration: 0.28, ease: "easeInOut" },
      );
      animate(
        ".presentation-center-square",
        { opacity: 1, scale: 1 },
        { duration: 0.18, ease: "easeOut", delay: 0.04 },
      );
    }, [animate]);

    const stop = useCallback(async () => {
      animate(
        ".presentation-icon",
        { y: 0 },
        { duration: 0.2, ease: "easeInOut" },
      );
      animate(
        ".presentation-center-square",
        { opacity: 0, scale: 0.7 },
        { duration: 0.14, ease: "easeInOut" },
      );
    }, [animate]);

    useImperativeHandle(ref, () => {
      return {
        startAnimation: start,
        stopAnimation: stop,
      };
    });

    return (
      <motion.span
        ref={scope}
        onHoverStart={start}
        onHoverEnd={stop}
        className={`inline-flex items-center justify-center ${className}`}
      >
        <motion.span
          className="presentation-icon relative inline-flex items-center justify-center"
          style={{ width: size, height: size, color }}
        >
          <Presentation size="100%" strokeWidth={strokeWidth} color="currentColor" />
          <span
            className="absolute left-1/2 top-[39%] -translate-x-1/2 -translate-y-1/2"
            style={{
              width: "19.5%",
              height: "19.5%",
            }}
          >
            <motion.span
              className="presentation-center-square block size-full rounded-[1px] bg-current"
              initial={{ opacity: 0, scale: 0.7 }}
            />
          </span>
        </motion.span>
      </motion.span>
    );
  },
);

CanvasIcon.displayName = "CanvasIcon";

export default CanvasIcon;
