"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { LayoutTemplate } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { cn } from "@workspace/ui";
import { useContextParams } from "@/shared/hooks/use-context-params";
import {
  DEFAULT_CENTER_SPACE_ID,
  type CenterSpaceRecord,
} from "@/app-shell/center-space/center-space";
import {
  hostSpaceAttentionReasons,
  offActiveSpaceAttentionReason,
} from "@/app-shell/center-space/center-space-attention";
import { useCenterSpaceOverviewStore } from "@/app-shell/center-space/center-space-overview-store";
import { useCenterSpaceStore } from "@/app-shell/center-space/center-space-store";
import { useAgentAttentionStore } from "@/features/agent/store/agent-attention-store";

const EMPTY_CENTER_SPACES: CenterSpaceRecord[] = [];

/** Same pop as HeaderAttentionBell: the slot width springs so neighbors slide aside. */
const BUTTON_SIZE = 32;
const BADGE_INSET = 8;
/** Same 8px as the icon group's gap-2, inside the slot so it collapses on exit. */
const LEADING_GAP = 8;
const SLOT_WIDTH = LEADING_GAP + BUTTON_SIZE + BADGE_INSET;

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

export function CenterSpaceSwitcher() {
  const t = useTranslations("header.centerSpace");
  const reduced = useReducedMotion() ?? false;
  const { effectiveContextId: hostId, currentView } = useContextParams();
  const hydrate = useCenterSpaceStore((s) => s.hydrate);
  const spaces = useCenterSpaceStore((s) =>
    hostId ? s.byHost[hostId]?.spaces ?? EMPTY_CENTER_SPACES : EMPTY_CENTER_SPACES,
  );
  const activeSpaceId = useCenterSpaceStore((s) =>
    hostId ? s.getActiveSpaceId(hostId) : DEFAULT_CENTER_SPACE_ID,
  );
  const open = useCenterSpaceOverviewStore((s) => s.open);
  const spaceAttentionReasons = useAgentAttentionStore(
    useShallow((s) => hostSpaceAttentionReasons(s.panes.values(), hostId ?? "")),
  );
  const otherSpaceAttention = offActiveSpaceAttentionReason(
    spaceAttentionReasons,
    activeSpaceId,
  );
  const hostRef = React.useRef(hostId);

  const handleToggleOpen = React.useCallback(() => {
    const overview = useCenterSpaceOverviewStore.getState();
    if (overview.busy) return;
    if (overview.open) {
      overview.setOpen(false);
      return;
    }
    overview.setOpen(true);
  }, []);

  React.useEffect(() => {
    hydrate();
  }, [hydrate]);

  React.useEffect(() => {
    if (hostRef.current === hostId) return;
    hostRef.current = hostId;
    useCenterSpaceOverviewStore.getState().setOpen(false);
  }, [hostId]);

  React.useEffect(() => {
    const visible =
      Boolean(hostId) &&
      (currentView === "workspace" || currentView === "project") &&
      spaces.length >= 2;
    if (visible) return;
    if (useCenterSpaceOverviewStore.getState().open) {
      useCenterSpaceOverviewStore.getState().setOpen(false);
    }
  }, [currentView, hostId, spaces.length]);

  const inWorkspace =
    Boolean(hostId) && (currentView === "workspace" || currentView === "project");
  if (!inWorkspace) return null;

  const widthTransition = reduced ? FADE : WIDTH_SPRING;
  const popTransition = reduced ? FADE : POP_SPRING;
  const visible = spaces.length >= 2;

  return (
    <AnimatePresence initial={false}>
      {visible ? (
        <motion.div
          key="center-space-switcher"
          data-center-space-switcher=""
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: SLOT_WIDTH, opacity: 1 }}
          exit={{ width: 0, opacity: 0 }}
          transition={widthTransition}
          className="desktop-no-drag relative z-10 flex h-12 shrink-0 items-center self-center overflow-hidden"
        >
          <div
            className="flex items-center"
            style={{
              width: SLOT_WIDTH,
              paddingLeft: LEADING_GAP,
              paddingRight: BADGE_INSET,
            }}
          >
            <motion.div
              initial={reduced ? false : { scale: 0.45 }}
              animate={{ scale: 1 }}
              exit={reduced ? undefined : { scale: 0.45 }}
              transition={popTransition}
              className="origin-center shrink-0"
            >
              <button
                type="button"
                aria-haspopup="dialog"
                aria-expanded={open}
                aria-label={t("buttonCountAria", { count: spaces.length })}
                title={t("buttonLabel")}
                onClick={handleToggleOpen}
                className={cn(
                  "relative flex size-8 items-center justify-center rounded-md text-muted-foreground",
                  "hover:bg-accent hover:text-accent-foreground",
                  open && "bg-accent text-accent-foreground",
                )}
              >
                <LayoutTemplate className="size-4" />
                <span
                  aria-hidden="true"
                  className={cn(
                    "absolute -right-1 -top-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full px-0.5 text-[9px] font-semibold tabular-nums leading-none",
                    otherSpaceAttention === "permission_request"
                      ? "bg-amber-500 text-white"
                      : otherSpaceAttention === "task_complete"
                        ? "bg-emerald-500 text-white"
                        : "bg-primary text-primary-foreground",
                  )}
                >
                  {spaces.length}
                </span>
              </button>
            </motion.div>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
