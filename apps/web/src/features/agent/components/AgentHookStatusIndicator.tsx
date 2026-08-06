"use client";

import React, { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { TextShimmer, FilledBellIcon, cn } from "@workspace/ui";
import type { AnimatedIconHandle } from "@workspace/ui";
import { AGENT_STATE, type AgentHookState } from "@/features/agent/store/agent-hooks-store";
import { AgentRunningGlyph } from "@/features/agent/components/AgentRunningGlyph";
import {
  DEFAULT_INDICATOR_BY_PLACEMENT,
  type AgentActivityIndicatorId,
  type AgentIndicatorPlacement,
} from "@/features/agent/lib/agent-activity-indicator-styles";
import { useAgentActivityIndicatorSettingsStore } from "@/features/settings/store/agent-activity-indicator-settings-store";

export type AgentHookIndicatorVariant = "compact" | "full";

interface AgentHookStatusIndicatorProps {
  state: AgentHookState;
  variant?: AgentHookIndicatorVariant;
  className?: string;
  tool?: string;
  /**
   * Where this indicator is shown. Selects the user-configured running glyph.
   * Omit when forcing `styleId` (e.g. settings previews).
   */
  placement?: AgentIndicatorPlacement;
  /**
   * Force a specific running glyph (settings previews / tests).
   * Wins over `placement` when both are set.
   */
  styleId?: AgentActivityIndicatorId;
}

const STATE_DOT_COLORS: Record<AgentHookState, string> = {
  [AGENT_STATE.IDLE]: "bg-emerald-500/70",
  [AGENT_STATE.RUNNING]: "bg-blue-500",
  [AGENT_STATE.PERMISSION_REQUEST]: "bg-amber-500",
};

function useLoopingBell(ref: React.RefObject<AnimatedIconHandle | null>, intervalMs = 2000) {
  useEffect(() => {
    const timer = setInterval(() => {
      ref.current?.startAnimation();
    }, intervalMs);
    ref.current?.startAnimation();
    return () => clearInterval(timer);
  }, [ref, intervalMs]);
}

function PermissionBellCompact() {
  const t = useTranslations("Agent.components.hookStatus");
  const bellRef = useRef<AnimatedIconHandle>(null);
  useLoopingBell(bellRef);
  return (
    <span
      className="inline-flex size-5 items-center justify-center text-amber-400/70"
      title={t("permissionRequested")}
    >
      <FilledBellIcon ref={bellRef} size={14} color="currentColor" strokeWidth={0} />
    </span>
  );
}

function PermissionBellFull({ tool }: { tool?: string }) {
  const t = useTranslations("Agent.components.hookStatus");
  const bellRef = useRef<AnimatedIconHandle>(null);
  useLoopingBell(bellRef);
  return (
    <div className="flex items-center gap-1.5 whitespace-nowrap">
      <span className="inline-flex items-center text-amber-400/70">
        <FilledBellIcon ref={bellRef} size={14} color="currentColor" strokeWidth={0} />
      </span>
      <TextShimmer as="span" className="text-[10px] whitespace-nowrap text-amber-400/60" duration={2}>
        {tool ? t("waitingForPermissionWithTool", { tool }) : t("waitingForPermission")}
      </TextShimmer>
    </div>
  );
}

function useResolvedStyleId(
  placement: AgentIndicatorPlacement | undefined,
  styleId: AgentActivityIndicatorId | undefined,
): AgentActivityIndicatorId {
  const fromStore = useAgentActivityIndicatorSettingsStore((s) =>
    placement ? s[placement] : DEFAULT_INDICATOR_BY_PLACEMENT.left_sidebar,
  );
  if (styleId) return styleId;
  if (placement) return fromStore;
  return DEFAULT_INDICATOR_BY_PLACEMENT.left_sidebar;
}

function CompactIndicator({
  state,
  styleId,
}: {
  state: AgentHookState;
  styleId: AgentActivityIndicatorId;
}) {
  const t = useTranslations("Agent.components.hookStatus");

  if (state === AGENT_STATE.IDLE) {
    return null;
  }

  if (state === AGENT_STATE.PERMISSION_REQUEST) {
    return <PermissionBellCompact />;
  }

  return <AgentRunningGlyph styleId={styleId} density="compact" title={t("agentRunning")} />;
}

function RunningFullSpinner({
  tool,
  styleId,
}: {
  tool?: string;
  styleId: AgentActivityIndicatorId;
}) {
  const t = useTranslations("Agent.components.hookStatus");
  return (
    <div className="flex items-center gap-1.5 whitespace-nowrap">
      <AgentRunningGlyph styleId={styleId} density="full" />
      <TextShimmer as="span" className="text-[10px] whitespace-nowrap" duration={1.5}>
        {tool ? t("runningWithTool", { tool }) : t("agentRunning")}
      </TextShimmer>
    </div>
  );
}

function FullIndicator({
  state,
  tool,
  styleId,
}: {
  state: AgentHookState;
  tool?: string;
  styleId: AgentActivityIndicatorId;
}) {
  const t = useTranslations("Agent.components.hookStatus");
  if (state === AGENT_STATE.IDLE) {
    return (
      <div className="flex items-center gap-1.5">
        <div className={cn("size-2 rounded-full", STATE_DOT_COLORS[AGENT_STATE.IDLE])} />
        <span className="text-[10px] text-muted-foreground">
          {tool ? t("idleWithTool", { tool }) : t("idle")}
        </span>
      </div>
    );
  }

  if (state === AGENT_STATE.PERMISSION_REQUEST) {
    return <PermissionBellFull tool={tool} />;
  }

  return <RunningFullSpinner tool={tool} styleId={styleId} />;
}

export function AgentHookStatusIndicator({
  state,
  variant = "compact",
  className,
  tool,
  placement,
  styleId,
}: AgentHookStatusIndicatorProps) {
  const resolvedStyleId = useResolvedStyleId(placement, styleId);

  return (
    <div className={cn("flex items-center whitespace-nowrap", className)}>
      {variant === "compact" ? (
        <CompactIndicator state={state} styleId={resolvedStyleId} />
      ) : (
        <FullIndicator state={state} tool={tool} styleId={resolvedStyleId} />
      )}
    </div>
  );
}
