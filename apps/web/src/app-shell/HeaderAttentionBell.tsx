"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { AnimatePresence, motion } from "motion/react";
import { Bell } from "lucide-react";
import { cn, Tooltip, TooltipContent, TooltipTrigger } from "@workspace/ui";
import {
  selectAttentionCount,
  selectAttentionFilterMode,
  useAgentAttentionStore,
  type AttentionReason,
} from "@/features/agent/store/agent-attention-store";

const BELL_SIZE = 32;
const TRANSITION = { duration: 0.22, ease: [0.22, 1, 0.36, 1] as const };

/**
 * Header control: toggle left-sidebar filter to only workspaces/projects that need attention.
 * Hidden entirely when there is nothing to attend to; animates width so Quick Open can slide over.
 */
export function HeaderAttentionBell() {
  const t = useTranslations("header.attention");
  const count = useAgentAttentionStore(selectAttentionCount);
  const filterMode = useAgentAttentionStore(selectAttentionFilterMode);
  const toggleFilterMode = useAgentAttentionStore((s) => s.toggleFilterMode);
  // Badge color: yellow if any permission, else green for task-complete only.
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

  return (
    <AnimatePresence initial={false}>
      {visible ? (
        <motion.div
          key="header-attention-bell"
          initial={{ opacity: 0, width: 0 }}
          animate={{ opacity: 1, width: BELL_SIZE }}
          exit={{ opacity: 0, width: 0 }}
          transition={TRANSITION}
          className="desktop-no-drag shrink-0 overflow-hidden"
        >
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={t("ariaLabel")}
                aria-pressed={filterMode}
                onClick={() => toggleFilterMode()}
                className={cn(
                  "relative inline-flex size-8 items-center justify-center rounded-md transition-colors duration-200 ease-out",
                  filterMode
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                )}
              >
                <Bell className="size-4" />
                {count > 0 ? (
                  <span
                    className={cn(
                      "absolute right-0.5 top-0.5 flex h-2.5 min-w-2.5 items-center justify-center rounded-full px-0.5 text-[8px] font-semibold leading-none text-white",
                      badgeReason === "permission_request"
                        ? "bg-amber-500"
                        : "bg-emerald-500",
                    )}
                  >
                    {count > 9 ? "9+" : count}
                  </span>
                ) : null}
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {filterMode ? t("tooltipActive") : t("tooltip")}
            </TooltipContent>
          </Tooltip>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
