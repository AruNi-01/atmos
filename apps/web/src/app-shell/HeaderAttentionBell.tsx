"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowBigUp, Command } from "lucide-react";
import {
  cn,
  NotificationBell,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@workspace/ui";
import {
  selectAttentionCount,
  selectAttentionFilterMode,
  useAgentAttentionStore,
  type AttentionReason,
} from "@/features/agent/store/agent-attention-store";

const BELL_SIZE = 32;
/** Room for the orbiting badge so `overflow-hidden` on the width slot cannot clip it. */
const BADGE_INSET = 8;
/** Extra space before Quick Open, animated with the slot so the neighbor slides. */
const TRAILING_GAP = 8;
const SLOT_WIDTH = BADGE_INSET + BELL_SIZE + BADGE_INSET + TRAILING_GAP;

const WIDTH_SPRING = {
  type: "spring" as const,
  stiffness: 380,
  damping: 32,
  mass: 0.8,
};
const POP_SPRING = {
  type: "spring" as const,
  stiffness: 520,
  damping: 22,
  mass: 0.7,
};
const FADE = { duration: 0.16, ease: [0.22, 1, 0.36, 1] as const };

/**
 * Header control: toggle left-sidebar filter to only workspaces/projects that need attention.
 * Hidden entirely when there is nothing to attend to; the slot width springs so Quick Open slides.
 */
export function HeaderAttentionBell() {
  const t = useTranslations("header.attention");
  const reduced = useReducedMotion() ?? false;
  const count = useAgentAttentionStore(selectAttentionCount);
  const filterMode = useAgentAttentionStore(selectAttentionFilterMode);
  const toggleFilterMode = useAgentAttentionStore((s) => s.toggleFilterMode);
  // Badge color: orange if any permission, else green for task-complete only.
  const badgeReason = useAgentAttentionStore((s): AttentionReason | null => {
    let hasComplete = false;
    for (const pane of s.panes.values()) {
      if (pane.reason === "permission_request") return "permission_request";
      if (pane.reason === "task_complete") hasComplete = true;
    }
    return hasComplete ? "task_complete" : null;
  });

  // Hide when idle; keep visible while filter is on even if the last latch just cleared
  // (filter mode auto-turns off when count hits 0 in the store).
  const visible = count > 0 || filterMode;
  const widthTransition = reduced ? FADE : WIDTH_SPRING;
  const popTransition = reduced ? FADE : POP_SPRING;

  return (
    <AnimatePresence initial={false}>
      {visible ? (
        <motion.div
          key="header-attention-bell"
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: SLOT_WIDTH, opacity: 1 }}
          exit={{ width: 0, opacity: 0 }}
          transition={widthTransition}
          className="desktop-no-drag shrink-0 overflow-hidden"
        >
          <div
            className="flex items-center"
            style={{
              width: SLOT_WIDTH,
              paddingTop: BADGE_INSET,
              paddingBottom: BADGE_INSET,
              paddingLeft: BADGE_INSET,
              paddingRight: BADGE_INSET + TRAILING_GAP,
            }}
          >
            <motion.div
              initial={reduced ? false : { scale: 0.45 }}
              animate={{ scale: 1 }}
              exit={reduced ? undefined : { scale: 0.45 }}
              transition={popTransition}
              className="origin-center shrink-0"
            >
              <Tooltip>
                <TooltipTrigger asChild>
                  <NotificationBell
                    count={count}
                    max={9}
                    size={BELL_SIZE}
                    color={badgeReason === "permission_request" ? "orange" : "green"}
                    aria-label={t("ariaLabel")}
                    aria-pressed={filterMode}
                    onClick={() => toggleFilterMode()}
                    className={cn("hover:bg-accent", filterMode && "bg-accent")}
                  />
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  <div className="flex items-center gap-2">
                    <span>{filterMode ? t("tooltipActive") : t("tooltip")}</span>
                    <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border border-border bg-muted px-1.5 font-mono text-[10px] font-medium text-foreground/90">
                      <Command className="size-3" />
                      <ArrowBigUp className="size-3" />
                      <span className="text-xs">U</span>
                    </kbd>
                  </div>
                </TooltipContent>
              </Tooltip>
            </motion.div>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
