"use client";

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
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
            <motion.div
              key="agent-context-usage"
              className={cn(
                "pointer-events-auto flex min-h-0 w-full flex-col overflow-hidden",
                OVERLAY_CARD_MAX_HEIGHT_CLASS,
                subagentOverlay && "hidden",
              )}
              initial={false}
              animate={{ opacity: 1, y: 0 }}
              exit={{
                opacity: 0,
                y: 10,
                position: "absolute",
                left: 0,
                right: 0,
                bottom: 0,
                transition: reduceOverlayMotion
                  ? { duration: 0 }
                  : { duration: 0.28, ease: [0.22, 1, 0.36, 1] },
              }}
            >
              <ContextUsageDetailsPanel
                usage={sessionUsage}
                providerId={registryId}
                onClose={() => onContextUsageClose?.()}
              />
            </motion.div>
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
            <motion.div
              key="agent-grok-goal"
              className={cn(
                "pointer-events-auto flex min-h-0 w-full flex-col overflow-hidden",
                OVERLAY_CARD_MAX_HEIGHT_CLASS,
                subagentOverlay && "hidden",
              )}
              initial={false}
              animate={{ opacity: 1, y: 0 }}
              exit={{
                opacity: 0,
                y: 10,
                position: "absolute",
                left: 0,
                right: 0,
                bottom: 0,
                transition: reduceOverlayMotion
                  ? { duration: 0 }
                  : { duration: 0.28, ease: [0.22, 1, 0.36, 1] },
              }}
            >
              <GrokGoalPanel
                goal={grokGoal}
                messages={messages}
                plan={currentPlan}
                defaultOpen={grokCardsDefaultOpen}
              />
            </motion.div>
          ) : null}
          {showGrokWorkflowCard && grokWorkflow ? (
            <motion.div
              key="agent-grok-workflow"
              className={cn(
                "pointer-events-auto flex min-h-0 w-full flex-col overflow-hidden",
                OVERLAY_CARD_MAX_HEIGHT_CLASS,
                subagentOverlay && "hidden",
              )}
              initial={false}
              animate={{ opacity: 1, y: 0 }}
              exit={{
                opacity: 0,
                y: 10,
                position: "absolute",
                left: 0,
                right: 0,
                bottom: 0,
                transition: reduceOverlayMotion
                  ? { duration: 0 }
                  : { duration: 0.28, ease: [0.22, 1, 0.36, 1] },
              }}
            >
              <GrokWorkflowPanel
                workflow={grokWorkflow}
                messages={messages}
                defaultOpen={grokCardsDefaultOpen}
              />
            </motion.div>
          ) : null}
          {showSubagentTasksCard ? (
            <motion.div
              key="agent-subagent-tasks"
              className={cn(
                "pointer-events-auto flex min-h-0 w-full flex-col overflow-hidden",
                OVERLAY_CARD_MAX_HEIGHT_CLASS,
                subagentOverlay && "hidden",
              )}
              initial={false}
              animate={{ opacity: 1, y: 0 }}
              exit={{
                opacity: 0,
                y: 10,
                position: "absolute",
                left: 0,
                right: 0,
                bottom: 0,
                transition: reduceOverlayMotion
                  ? { duration: 0 }
                  : { duration: 0.28, ease: [0.22, 1, 0.36, 1] },
              }}
            >
              <SubagentTasksPanel
                tools={subagentTasks.items}
                messages={messages}
              />
            </motion.div>
          ) : null}
        </AnimatePresence>
        {aboveInputOverlay ? (
          <div className={cn(subagentOverlay && "hidden")}>{aboveInputOverlay}</div>
        ) : null}
      </div>
    </div>
  );
}
