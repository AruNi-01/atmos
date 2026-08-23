"use client";

import {
  AnimatePresence,
  motion,
  useReducedMotion,
  type HTMLMotionProps,
  type Variants,
} from "motion/react";
import { useLayoutEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { EASE_OUT, EASE_OUT_CSS, SPRING_SWAP } from "../../lib/ease";
import { cn } from "../../lib/utils";

export type ActionSwapItem = {
  id: string;
  label: ReactNode;
  icon?: ReactNode;
  ariaLabel?: string;
};

export type ActionSwapButtonVariant = "primary" | "secondary" | "outline" | "ghost";
export type ActionSwapButtonSize = "sm" | "md" | "lg" | "icon";
export type ActionSwapAnimation = "blur" | "roll" | "cascade";

/** Animations with a single-element variant set (cascade animates per letter). */
type CoreAnimation = "blur" | "roll";

export interface ActionSwapButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "onChange"> {
  items: ActionSwapItem[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string, item: ActionSwapItem) => void;
  variant?: ActionSwapButtonVariant;
  size?: ActionSwapButtonSize;
  animation?: ActionSwapAnimation;
  iconOnly?: boolean;
  cycle?: boolean;
}

export interface ActionSwapTextProps {
  value: string;
  children: ReactNode;
  animation?: ActionSwapAnimation;
  className?: string;
}

export interface ActionSwapIconProps {
  value: string;
  children: ReactNode;
  animation?: ActionSwapAnimation;
  className?: string;
}

const BLUR_TRANSITION = { duration: 0.2, ease: "easeInOut" } as const;
const ROLL_TRANSITION = SPRING_SWAP;
const ROLL_EXIT_TRANSITION = { duration: 0.14, ease: EASE_OUT } as const;

// Cascade rolls the label one letter at a time, left to right. The leaving
// and landing strings overlap as independent layers (no shared cells), so
// proportional glyph widths never jitter. Exits cascade at half the enter
// stagger so the tail of the old label lingers briefly.
//
// No `filter` / blur — filtered paint expands ancestor scrollable overflow
// and flex min-content size even inside overflow:hidden, which shoved the
// Token Usage page content down below the toolbar.
const CASCADE_STAGGER = 0.025;

const CASCADE_LETTER_VARIANTS: Variants = {
  initial: { opacity: 0, y: "100%" },
  animate: (delay: number = 0) => ({
    opacity: 1,
    y: "0%",
    transition: { ...SPRING_SWAP, delay },
  }),
  exit: (delay: number = 0) => ({
    opacity: 0,
    y: "-100%",
    transition: { duration: 0.16, ease: EASE_OUT, delay: delay * 0.5 },
  }),
};

const TEXT_VARIANTS: Record<CoreAnimation, Variants> = {
  blur: {
    initial: { opacity: 0, scale: 0.94 },
    animate: {
      opacity: 1,
      scale: 1,
      transition: BLUR_TRANSITION,
    },
    exit: {
      opacity: 0,
      scale: 0.94,
      transition: BLUR_TRANSITION,
    },
  },
  roll: {
    initial: { opacity: 0, y: "90%" },
    animate: {
      opacity: 1,
      y: "0%",
      transition: ROLL_TRANSITION,
    },
    exit: {
      opacity: 0,
      y: "-90%",
      transition: ROLL_EXIT_TRANSITION,
    },
  },
};

const ICON_VARIANTS: Record<CoreAnimation, Variants> = {
  blur: {
    initial: { opacity: 0, scale: 0.25 },
    animate: {
      opacity: 1,
      scale: 1,
      transition: BLUR_TRANSITION,
    },
    exit: {
      opacity: 0,
      scale: 0.25,
      transition: BLUR_TRANSITION,
    },
  },
  roll: {
    initial: { opacity: 0, y: "60%" },
    animate: {
      opacity: 1,
      y: "0%",
      transition: ROLL_TRANSITION,
    },
    exit: {
      opacity: 0,
      y: "-60%",
      transition: ROLL_EXIT_TRANSITION,
    },
  },
};

const VARIANT_CLASS: Record<ActionSwapButtonVariant, string> = {
  primary: "bg-primary text-primary-foreground hover:bg-primary/90",
  secondary: "border border-border bg-card text-foreground hover:border-border",
  outline: "border border-border bg-transparent text-foreground hover:bg-primary/5",
  ghost: "text-muted-foreground hover:bg-primary/5 hover:text-foreground",
};

const SIZE_CLASS: Record<ActionSwapButtonSize, string> = {
  sm: "h-8 max-h-8 min-h-0 gap-1.5 rounded-full px-3 text-xs leading-none",
  md: "h-10 max-h-10 min-h-0 gap-2 rounded-full px-4 text-sm leading-none",
  lg: "h-12 max-h-12 min-h-0 gap-2.5 rounded-full px-5 text-base leading-none",
  icon: "h-10 max-h-10 min-h-0 w-10 rounded-full",
};

export function ActionSwapText({
  value,
  children,
  animation = "blur",
  className,
}: ActionSwapTextProps) {
  const reduce = useReducedMotion();
  const measureRef = useRef<HTMLSpanElement>(null);
  const [width, setWidth] = useState<number>();

  useLayoutEffect(() => {
    const nextWidth = measureRef.current?.offsetWidth;
    if (!nextWidth) return;
    setWidth((currentWidth) => (currentWidth === nextWidth ? currentWidth : nextWidth));
  }, [value, children]);

  // Cascade needs a plain string to split into letters; non-string content
  // and reduced motion fall back to the closest single-element animation.
  const label = typeof children === "string" ? children : null;
  const cascade = animation === "cascade" && label !== null && !reduce;
  const coreAnimation: CoreAnimation =
    animation === "cascade" ? "roll" : animation;

  return (
    <span
      className={cn(
        // Fixed line box; measure node is out-of-flow so it can never grow
        // flex min-content height of toolbars above page content.
        "relative inline-block h-[1em] max-h-[1em] overflow-hidden whitespace-nowrap align-middle leading-none",
        className,
      )}
      style={{
        width,
        height: "1em",
        maxHeight: "1em",
        transition: reduce || width == null ? undefined : `width 220ms ${EASE_OUT_CSS}`,
      }}
    >
      {/* Before first measure: in-flow sizer. After: out-of-flow so it cannot
          inflate flex min-content height of the toolbar. */}
      <span
        ref={measureRef}
        aria-hidden
        className={cn(
          "whitespace-nowrap leading-none",
          width == null
            ? "invisible inline-block"
            : "pointer-events-none absolute left-0 top-0 opacity-0",
        )}
      >
        {children}
      </span>
      {cascade ? (
        <>
          <span className="sr-only">{label}</span>
          <AnimatePresence initial={false}>
            <motion.span
              key={`cascade-${value}`}
              aria-hidden
              initial="initial"
              animate="animate"
              exit="exit"
              className="absolute inset-0 inline-block overflow-hidden whitespace-pre leading-none"
            >
              {label.split("").map((char, i) => (
                <motion.span
                  // biome-ignore lint/suspicious/noArrayIndexKey: position is the slot identity — the letter at a position is exactly what rolls.
                  key={i}
                  custom={i * CASCADE_STAGGER}
                  variants={CASCADE_LETTER_VARIANTS}
                  className="inline-block whitespace-pre will-change-transform"
                >
                  {char}
                </motion.span>
              ))}
            </motion.span>
          </AnimatePresence>
        </>
      ) : (
        <AnimatePresence initial={false}>
          <motion.span
            key={`${animation}-${value}`}
            variants={TEXT_VARIANTS[coreAnimation]}
            initial={reduce ? false : "initial"}
            animate={reduce ? { opacity: 1, scale: 1, y: 0 } : "animate"}
            exit={reduce ? undefined : "exit"}
            className="absolute inset-0 inline-block overflow-hidden leading-none will-change-transform"
          >
            {children}
          </motion.span>
        </AnimatePresence>
      )}
    </span>
  );
}

export function ActionSwapIcon({
  value,
  children,
  animation = "blur",
  className,
}: ActionSwapIconProps) {
  const reduce = useReducedMotion();
  // Icons are single elements — cascade maps to its closest motion, roll.
  const coreAnimation: CoreAnimation =
    animation === "cascade" ? "roll" : animation;

  return (
    <span
      className={cn(
        "relative inline-grid size-4 max-h-4 min-h-0 shrink-0 place-items-center overflow-hidden",
        className,
      )}
    >
      <AnimatePresence initial={false}>
        <motion.span
          key={`${animation}-${value}`}
          aria-hidden
          variants={ICON_VARIANTS[coreAnimation]}
          initial={reduce ? false : "initial"}
          animate={reduce ? { opacity: 1, scale: 1, y: 0 } : "animate"}
          exit={reduce ? undefined : "exit"}
          className="col-start-1 row-start-1 inline-flex size-full items-center justify-center overflow-hidden will-change-transform"
        >
          {children}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

export function ActionSwapButton({
  items,
  value,
  defaultValue,
  onValueChange,
  variant = "secondary",
  size = "md",
  animation = "blur",
  iconOnly = size === "icon",
  cycle = true,
  className,
  disabled,
  onClick,
  type = "button",
  ...rest
}: ActionSwapButtonProps) {
  const [internalValue, setInternalValue] = useState(defaultValue ?? items[0]?.id);
  const currentValue = value ?? internalValue;
  const activeIndex = Math.max(0, items.findIndex((item) => item.id === currentValue));
  const activeItem = items[activeIndex] ?? items[0];
  const hasIcon = items.some((item) => item.icon);
  const nextItem = cycle && items.length > 0 ? items[(activeIndex + 1) % items.length] : undefined;

  if (!activeItem) return null;

  const accessibleLabel =
    activeItem.ariaLabel ??
    (iconOnly && typeof activeItem.label === "string" ? activeItem.label : undefined);

  return (
    // Plain <button> (not motion.button): layout projections / whileTap scale
    // were contributing to flex min-content height and shoving page content.
    <button
      type={type}
      disabled={disabled}
      className={cn(
        "inline-flex max-h-full min-h-0 shrink-0 items-center justify-center overflow-hidden font-medium active:scale-[0.97]",
        "disabled:pointer-events-none disabled:opacity-50",
        VARIANT_CLASS[variant],
        SIZE_CLASS[size],
        className,
      )}
      aria-label={accessibleLabel}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented || disabled || !cycle || !nextItem) return;
        if (value === undefined) setInternalValue(nextItem.id);
        onValueChange?.(nextItem.id, nextItem);
      }}
      {...rest}
    >
      {hasIcon ? (
        <ActionSwapIcon value={activeItem.id} animation={animation}>
          {activeItem.icon ?? null}
        </ActionSwapIcon>
      ) : null}
      {!iconOnly ? (
        <ActionSwapText value={activeItem.id} animation={animation}>
          {activeItem.label}
        </ActionSwapText>
      ) : null}
    </button>
  );
}
