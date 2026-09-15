"use client";

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Button, cn } from "@workspace/ui";

/** Same easing as Disk Analyzer scan / cancel label swap. */
export const MORPH_SWAP_EASE = [0.22, 1, 0.36, 1] as const;
export const MORPH_SWAP_TRANSITION = { duration: 0.2, ease: MORPH_SWAP_EASE } as const;

export function MorphingSwap({
  stateKey,
  children,
  reserve,
  className,
}: {
  stateKey: string;
  children: ReactNode;
  reserve?: ReactNode;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();
  const transition = reduceMotion ? { duration: 0 } : MORPH_SWAP_TRANSITION;

  return (
    <span className={cn("relative inline-grid overflow-hidden leading-none", className)}>
      {reserve ? (
        <span className="invisible col-start-1 row-start-1" aria-hidden>
          {reserve}
        </span>
      ) : null}
      {reduceMotion ? (
        <span className="col-start-1 row-start-1">{children}</span>
      ) : (
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={stateKey}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={transition}
            className="col-start-1 row-start-1"
          >
            {children}
          </motion.span>
        </AnimatePresence>
      )}
    </span>
  );
}

export type MorphingIconToggleOption<T extends string = string> = {
  value: T;
  icon: LucideIcon;
  label: string;
};

export function MorphingIconToggle<T extends string>({
  value,
  options,
  onChange,
  className,
  "data-testid": testId,
}: {
  value: T;
  options: readonly MorphingIconToggleOption<T>[];
  onChange: (value: T) => void;
  className?: string;
  "data-testid"?: string;
}) {
  const current = options.find((option) => option.value === value) ?? options[0];
  if (!current) return null;
  const next = options.find((option) => option.value !== current.value) ?? current;
  const Icon = current.icon;

  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      className={cn(
        "size-11 sm:size-11 shrink-0 rounded-xl border-border/50 bg-muted/20 shadow-sm hover:bg-background",
        className,
      )}
      aria-label={current.label}
      title={current.label}
      data-testid={testId}
      data-view={current.value}
      onClick={() => onChange(next.value)}
    >
      <MorphingSwap stateKey={current.value} className="flex size-4 items-center justify-center">
        <Icon className="size-4" />
      </MorphingSwap>
    </Button>
  );
}
