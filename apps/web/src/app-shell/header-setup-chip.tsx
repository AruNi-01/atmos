"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { cn } from "@workspace/ui";
import { HEADER_CHIP_HOVER_CLASS, HEADER_CHIP_SURFACE_CLASS } from "./header-parts";

const AUTO_ENTER_ACTIONS_TRANSITION = { duration: 0.22, ease: [0.22, 1, 0.36, 1] as const };

export type HeaderSetupAutoEnter = {
  remainingSeconds: number;
  grouped: boolean;
  onStay: () => void;
  onEnter: () => void;
};

export const HEADER_SETUP_CHIP_TRIGGER_CLASS =
  "flex h-7 min-w-0 flex-1 cursor-pointer items-center gap-2 pl-2 pr-1.5 text-left";

export function HeaderSetupChipFrame({
  children,
  autoEnter,
  onHoverChange,
}: {
  children: React.ReactNode;
  autoEnter?: HeaderSetupAutoEnter | null;
  onHoverChange?: (hovered: boolean) => void;
}) {
  const [hovering, setHovering] = React.useState(false);
  const onHoverChangeRef = React.useRef(onHoverChange);
  React.useEffect(() => {
    onHoverChangeRef.current = onHoverChange;
  });

  const setHover = React.useCallback((next: boolean) => {
    setHovering(next);
    onHoverChangeRef.current?.(next);
  }, []);

  React.useEffect(() => {
    return () => onHoverChangeRef.current?.(false);
  }, []);

  return (
    <div
      className={cn(
        "flex h-7 max-w-[min(100%,420px)] min-w-0 items-center rounded-md",
        HEADER_CHIP_SURFACE_CLASS,
        HEADER_CHIP_HOVER_CLASS,
      )}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {children}
      <AnimatePresence initial={false}>
        {autoEnter ? (
          <SetupChipAutoEnter
            remainingSeconds={autoEnter.remainingSeconds}
            hovered={hovering}
            grouped={autoEnter.grouped}
            onStay={autoEnter.onStay}
            onEnter={autoEnter.onEnter}
          />
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function SetupChipAutoEnter({
  remainingSeconds,
  hovered,
  grouped,
  onStay,
  onEnter,
}: {
  remainingSeconds: number;
  hovered: boolean;
  grouped: boolean;
  onStay: () => void;
  onEnter: () => void;
}) {
  const t = useTranslations("header.workspaceJobs");
  const reduceMotion = useReducedMotion();
  const innerRef = React.useRef<HTMLDivElement>(null);
  const [width, setWidth] = React.useState(0);
  const transition = reduceMotion ? { duration: 0 } : AUTO_ENTER_ACTIONS_TRANSITION;

  React.useLayoutEffect(() => {
    const node = innerRef.current;
    if (!node) return;
    const update = () => setWidth(node.scrollWidth);
    update();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, [grouped, hovered, remainingSeconds]);

  return (
    <motion.div
      initial={reduceMotion ? { width, opacity: 1 } : { width: 0, opacity: 0 }}
      animate={{ width, opacity: 1 }}
      exit={reduceMotion ? { opacity: 0 } : { width: 0, opacity: 0 }}
      transition={transition}
      className="h-7 shrink-0 overflow-hidden"
    >
      <div
        ref={innerRef}
        className={cn("flex h-7 w-max items-center", hovered ? "gap-1 px-1" : "px-2")}
        role="status"
        aria-label={
          hovered
            ? grouped
              ? t("autoEnterStayAllAria")
              : t("autoEnterPausedAria")
            : t("autoEnterCountdownAria", { seconds: remainingSeconds })
        }
      >
        {hovered ? (
          <>
            <button
              type="button"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onStay();
              }}
              className="inline-flex h-6 items-center rounded-md px-2 text-[11px] font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            >
              {grouped ? t("autoEnterStayAll") : t("autoEnterStay")}
            </button>
            {grouped ? null : (
              <button
                type="button"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onEnter();
                }}
                className="inline-flex h-6 items-center rounded-md bg-primary px-2 text-[11px] font-medium text-primary-foreground hover:bg-primary/90"
              >
                {t("autoEnterNow")}
              </button>
            )}
          </>
        ) : (
          <span className="whitespace-nowrap text-[12px] font-medium tabular-nums">
            {t("autoEnterCountdown", { seconds: remainingSeconds })}
          </span>
        )}
      </div>
    </motion.div>
  );
}
