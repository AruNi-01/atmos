"use client";
// beui.dev/components/motion/range-slider

import {
  motion,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from "motion/react";
import { useLayoutEffect } from "react";

import { SPRING_GLIDE } from "../../lib/ease";
import { type SliderOptions, useSlider } from "../../lib/hooks/use-slider";
import { TOUCH_GESTURE_CLASS } from "../../lib/touch";
import { cn } from "../../lib/utils";
import { ExhaustFill } from "./exhaust-fill";

// Bouncy grab feedback for the thumb scale only.
const SPRING_BOUNCY = { type: "spring", stiffness: 500, damping: 14, mass: 0.7 } as const;

export interface RangeSliderProps extends SliderOptions {
  /** Render a tick at each step. */
  showTicks?: boolean;
  /** Compact bar (default) or the Effort popover track. */
  variant?: "bar" | "effort";
  /** When the value is at `max`, morph the track into a plasma fill. */
  maxEffect?: boolean;
  className?: string;
}

export function RangeSlider({
  showTicks = true,
  variant = "bar",
  maxEffect = false,
  className,
  onDragPercent,
  ...options
}: RangeSliderProps) {
  const reduce = useReducedMotion();
  const target = useMotionValue(0);
  const { percent, current, dragging, min, max, step, trackProps, sliderProps } =
    useSlider({
      ...options,
      onDragPercent: (next) => {
        target.set(next);
        onDragPercent?.(next);
      },
    });
  const effort = variant === "effort";
  const atMax = maxEffect && current === max && max > min;

  useLayoutEffect(() => {
    if (!dragging) target.set(percent);
  }, [dragging, percent, target]);

  const smooth = useSpring(target, SPRING_GLIDE);
  const pos = reduce ? target : smooth;
  const left = useMotionTemplate`${pos}%`;
  // Self-offset the thumb from 0% (flush left) to -100% (flush right) of its
  // own width so it stays fully inside the track at both ends — no clip, no gap.
  const thumbX = useTransform(pos, (p) => `${-p}%`);

  // Floor rather than round, so a range the step does not divide (0 to 10 by 4)
  // stops its dots at the last whole step instead of drawing one past max.
  // toFixed comes first because 0.3/0.1 is 2.9999999999999996, which would
  // floor to 2 and drop the last dot.
  const steps = Math.floor(Number(((max - min) / step).toFixed(6)));
  const ticks =
    showTicks && steps > 0 && steps <= 50
      ? Array.from({ length: steps + 1 }, (_, i) => Number((min + i * step).toFixed(6)))
      : [];

  return (
    <div
      {...trackProps}
      className={cn(
        "relative flex w-full touch-none items-center overflow-hidden",
        effort
          ? cn("h-8 rounded-full", atMax ? "bg-[#05070e]" : "bg-foreground/10 dark:bg-black/55")
          : "h-10 rounded-lg bg-muted",
        TOUCH_GESTURE_CLASS,
        options.disabled
          ? "pointer-events-none opacity-50"
          : "cursor-grab active:cursor-grabbing",
        className,
      )}
    >
      <motion.div
        className={cn(
          "absolute inset-y-0 left-0",
          effort ? "bg-foreground/15 dark:bg-white/18" : "bg-foreground/15",
        )}
        style={{ width: left }}
        animate={{ opacity: atMax ? 0 : 1 }}
      />

      <div
        className={cn(
          "pointer-events-none absolute inset-y-0",
          effort ? "inset-x-3" : "inset-x-[3px]",
          atMax && "opacity-0",
        )}
      >
        {ticks.map((t) => {
          const tp = ((t - min) / (max - min)) * 100;
          return (
            <span
              key={t}
              className={cn(
                "absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full",
                effort ? "h-3.5 w-0.5 bg-foreground/30 dark:bg-white/35" : "size-1 bg-foreground/25",
              )}
              style={{ left: `${tp}%` }}
            />
          );
        })}
      </div>

      <motion.div
        {...sliderProps}
        animate={
          reduce
            ? undefined
            : effort
              ? { scale: dragging ? 1.06 : 1 }
              : { scaleY: dragging ? 1.35 : 1 }
        }
        transition={SPRING_BOUNCY}
        className={cn(
          "absolute top-1/2 z-10 outline-none focus-visible:ring-4",
          effort
            ? atMax
              ? "h-6 w-3.5 rounded-md bg-white shadow-[0_0_12px_rgba(186,230,253,0.9)]"
              : "h-6 w-3.5 rounded-md bg-foreground/45 shadow-sm ring-inset ring-foreground/20 focus-visible:ring-foreground/30 dark:bg-neutral-300"
            : "h-5 w-1.5 rounded-sm bg-foreground shadow-sm ring-inset ring-foreground/30 focus-visible:ring-foreground/30",
        )}
        style={{ left, x: thumbX, y: "-50%" }}
      />

      <motion.div
        aria-hidden={!atMax}
        animate={{ opacity: atMax ? 1 : 0 }}
        transition={reduce ? { duration: 0 } : { duration: 0.22 }}
        className="pointer-events-none absolute inset-0"
      >
        <ExhaustFill reduce={reduce} active={atMax} />
      </motion.div>
    </div>
  );
}
