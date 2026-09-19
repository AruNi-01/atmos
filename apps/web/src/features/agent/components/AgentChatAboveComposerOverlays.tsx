"use client";

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { EASE_OUT } from "@workspace/ui/lib/ease";
import { cn } from "@/shared/lib/utils";
import type {
  AgentMessage,
  AgentSessionUsage,
  GrokGoal,
  GrokWorkflow,
} from "@atmos/api-types/ws/dto/agent-chat";
import type { AgentPlan } from "@/features/agent/lib/agent-chat-types";
import type { CurrentTurnSubagentTasks } from "@/features/agent/lib/subagent-tasks";
import {
  OVERLAY_CARD_MAX_HEIGHT_CLASS,
  OVERLAY_CARD_MAX_HEIGHT_VAR,
  subagentOverlayFrameHeight,
} from "@/features/agent/lib/subagent-overlay-layout";
import { ContextUsageDetailsPanel } from "./UsageBadges";
import { GrokGoalPanel } from "./grok/GrokGoalPanel";
import { GrokWorkflowPanel } from "./grok/GrokWorkflowPanel";
import { SubagentTasksPanel } from "./SubagentTasksDock";

/** Fade only. Do not animate y, scale, or position: those made the card slide,
 *  flash wider, then shrink-wrap over the message-queue inset. */
const OVERLAY_CARD_FADE_HIDDEN = { opacity: 0 } as const;
const OVERLAY_CARD_FADE_SHOWN = { opacity: 1 } as const;

function overlayCardFadeTransition(reduceMotion: boolean) {
  return reduceMotion ? { duration: 0 } : { duration: 0.18, ease: EASE_OUT };
}

const OverlayFadeCard = React.forwardRef<
  HTMLDivElement,
  {
    reduceMotion: boolean;
    className?: string;
    children: React.ReactNode;
  }
>(function OverlayFadeCard({ reduceMotion, className, children }, ref) {
  return (
    <motion.div
      ref={ref}
      className={cn(
        "pointer-events-auto flex min-h-0 w-full max-w-full flex-col overflow-hidden",
        OVERLAY_CARD_MAX_HEIGHT_CLASS,
        className,
      )}
      initial={OVERLAY_CARD_FADE_HIDDEN}
      animate={OVERLAY_CARD_FADE_SHOWN}
      exit={OVERLAY_CARD_FADE_HIDDEN}
      transition={overlayCardFadeTransition(reduceMotion)}
      style={{ width: "100%" }}
    >
      {children}
    </motion.div>
  );
});
OverlayFadeCard.displayName = "OverlayFadeCard";

export function AgentChatAboveComposerOverlays({
  composerSurfaceRef,
  messages,
  grokGoal = null,
  grokWorkflow = null,
  currentPlan = null,
  subagentTasks,
  subagentOverlay = null,
  aboveInputOverlay = null,
  sessionUsage = null,
  registryId = null,
  contextUsageOpen = false,
  onContextUsageClose,
  grokCardsDefaultOpen = true,
  hasUpperComposerCards = false,
  onLaneNodeChange,
}: {
  composerSurfaceRef: React.RefObject<HTMLDivElement | null>;
  messages: AgentMessage[];
  grokGoal?: GrokGoal | null;
  grokWorkflow?: GrokWorkflow | null;
  currentPlan?: AgentPlan | null;
  subagentTasks: CurrentTurnSubagentTasks;
  subagentOverlay?: React.ReactNode;
  aboveInputOverlay?: React.ReactNode;
  sessionUsage?: AgentSessionUsage | null;
  registryId?: string | null;
  contextUsageOpen?: boolean;
  onContextUsageClose?: () => void;
  grokCardsDefaultOpen?: boolean;
  hasUpperComposerCards?: boolean;
  onLaneNodeChange?: (node: HTMLDivElement | null) => void;
}) {
  const overlayLaneRef = useRef<HTMLDivElement | null>(null);
  const [laneNode, setLaneNode] = useState<HTMLDivElement | null>(null);
  const reduceOverlayMotion = Boolean(useReducedMotion());
  const overlayOpen = Boolean(subagentOverlay);
  const showContextUsageCard = Boolean(contextUsageOpen && sessionUsage);
  const showGrokGoalCard = Boolean(grokGoal && grokGoal.status !== "cleared");
  const showGrokWorkflowCard = Boolean(grokWorkflow && grokWorkflow.status !== "cleared");
  const showSubagentTasksCard = subagentTasks.items.length > 0;
  const capOverlayLane =
    overlayOpen
    || showContextUsageCard
    || showGrokGoalCard
    || showGrokWorkflowCard
    || showSubagentTasksCard;

  const setOverlayLaneNode = useCallback(
    (node: HTMLDivElement | null) => {
      overlayLaneRef.current = node;
      setLaneNode(node);
      onLaneNodeChange?.(node);
    },
    [onLaneNodeChange],
  );

  useEffect(() => {
    return () => onLaneNodeChange?.(null);
  }, [onLaneNodeChange]);

  useLayoutEffect(() => {
    const lane = laneNode ?? overlayLaneRef.current;
    if (!lane) return;
    if (!capOverlayLane) {
      lane.style.removeProperty("height");
      lane.style.removeProperty("max-height");
      lane.style.removeProperty(OVERLAY_CARD_MAX_HEIGHT_VAR);
      return;
    }
    const column = lane.closest("[data-agent-chat-column]");
    if (!(column instanceof HTMLElement)) return;
    const composer =
      lane.closest("[data-agent-chat-composer]")
      ?? composerSurfaceRef.current;
    const apply = () => {
      const composerHeight = composer instanceof HTMLElement ? composer.clientHeight : 0;
      const next = `${subagentOverlayFrameHeight(column.clientHeight, composerHeight)}px`;
      if (lane.style.getPropertyValue(OVERLAY_CARD_MAX_HEIGHT_VAR) !== next) {
        lane.style.setProperty(OVERLAY_CARD_MAX_HEIGHT_VAR, next);
      }
      if (overlayOpen) {
        if (lane.style.height !== next) lane.style.height = next;
        lane.style.removeProperty("max-height");
        return;
      }
      lane.style.removeProperty("height");
      if (lane.style.maxHeight !== next) lane.style.maxHeight = next;
    };
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(column);
    if (composer instanceof HTMLElement) observer.observe(composer);
    return () => {
      observer.disconnect();
    };
  }, [capOverlayLane, composerSurfaceRef, laneNode, overlayOpen]);

  return (
    <div
      ref={setOverlayLaneNode}
      data-agent-chat-above-composer-overlays=""
      className={cn(
        "pointer-events-none absolute inset-x-0 bottom-full z-20 flex w-full min-h-0 flex-col gap-2 has-[.pointer-events-auto]:pb-2",
        capOverlayLane && "overflow-hidden",
      )}
    >
      <div
        data-agent-chat-scroll-button-host=""
        className="flex justify-center empty:hidden"
      />
      <div
        className={cn(
          "flex min-h-0 w-full flex-col gap-2 empty:hidden",
          subagentOverlay && "h-full min-h-0 flex-1 overflow-hidden",
          capOverlayLane && !subagentOverlay && "max-h-full overflow-y-auto",
          hasUpperComposerCards && "px-6",
        )}
      >
        <AnimatePresence initial={false}>
          {showContextUsageCard ? (
            <OverlayFadeCard
              key="agent-context-usage"
              reduceMotion={reduceOverlayMotion}
              className={subagentOverlay ? "hidden" : undefined}
            >
              <ContextUsageDetailsPanel
                usage={sessionUsage}
                providerId={registryId}
                onClose={() => onContextUsageClose?.()}
              />
            </OverlayFadeCard>
          ) : null}
          {subagentOverlay ? (
            <div
              data-agent-subagent-overlay=""
              className="pointer-events-auto relative z-30 flex h-full min-h-0 min-w-0 w-full flex-1 select-text flex-col overflow-hidden"
            >
              {subagentOverlay}
            </div>
          ) : null}
          {showGrokGoalCard && grokGoal ? (
            <OverlayFadeCard
              key="agent-grok-goal"
              reduceMotion={reduceOverlayMotion}
              className={subagentOverlay ? "hidden" : undefined}
            >
              <GrokGoalPanel
                goal={grokGoal}
                messages={messages}
                plan={currentPlan}
                defaultOpen={grokCardsDefaultOpen}
              />
            </OverlayFadeCard>
          ) : null}
          {showGrokWorkflowCard && grokWorkflow ? (
            <OverlayFadeCard
              key="agent-grok-workflow"
              reduceMotion={reduceOverlayMotion}
              className={subagentOverlay ? "hidden" : undefined}
            >
              <GrokWorkflowPanel
                workflow={grokWorkflow}
                messages={messages}
                defaultOpen={grokCardsDefaultOpen}
              />
            </OverlayFadeCard>
          ) : null}
          {showSubagentTasksCard ? (
            <OverlayFadeCard
              key="agent-subagent-tasks"
              reduceMotion={reduceOverlayMotion}
              className={subagentOverlay ? "hidden" : undefined}
            >
              <SubagentTasksPanel
                tools={subagentTasks.items}
                messages={messages}
              />
            </OverlayFadeCard>
          ) : null}
          {aboveInputOverlay ? (
            <OverlayFadeCard
              key="agent-above-input-overlay"
              reduceMotion={reduceOverlayMotion}
              className={subagentOverlay ? "hidden" : undefined}
            >
              {aboveInputOverlay}
            </OverlayFadeCard>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );
}
