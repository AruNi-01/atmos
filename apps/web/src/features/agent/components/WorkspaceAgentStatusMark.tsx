"use client";

import React from "react";
import { cn } from "@workspace/ui";
import { AgentAttentionIndicator } from "@/features/agent/components/AgentAttentionIndicator";
import { AgentHookStatusIndicator } from "@/features/agent/components/AgentHookStatusIndicator";
import {
  useProjectAgentStatusRollup,
  useWorkspaceAgentStatus,
} from "@/features/agent/hooks/use-workspace-agent-status";
import type { AgentIndicatorPlacement } from "@/features/agent/lib/agent-activity-indicator-styles";
import type { WorkspaceAgentStatusView } from "@/features/agent/lib/workspace-agent-status";

export type WorkspaceAgentStatusMarkProps = {
  /** Workspace or project context GUID. */
  contextId: string;
  /**
   * Running-glyph placement. List surfaces (sidebar / kanban / search) share
   * `left_sidebar` so one settings control covers them all.
   */
  placement?: AgentIndicatorPlacement;
  /** Attention bell size (px). */
  size?: number;
  className?: string;
};

function renderStatusView(
  view: WorkspaceAgentStatusView,
  placement: AgentIndicatorPlacement,
  size: number,
  className: string | undefined,
): React.ReactNode {
  if (view.kind === "none") return null;

  if (view.kind === "attention") {
    return (
      <AgentAttentionIndicator
        reason={view.reason}
        className={cn("shrink-0", className)}
        size={size}
      />
    );
  }

  return (
    <AgentHookStatusIndicator
      state={view.state}
      variant="compact"
      placement={placement}
      className={cn("shrink-0", className)}
    />
  );
}

/**
 * Compact agent status mark for workspace/project list rows.
 * Subscribes to hooks + attention stores; renders nothing when idle.
 */
export function WorkspaceAgentStatusMark({
  contextId,
  placement = "left_sidebar",
  size = 12,
  className,
}: WorkspaceAgentStatusMarkProps) {
  const { view } = useWorkspaceAgentStatus(contextId);
  return <>{renderStatusView(view, placement, size, className)}</>;
}

/**
 * Project-row variant: when `rollupAttention` is true (collapsed), sticky
 * attention includes child workspaces — same as the pre-shared ProjectItem.
 */
export function ProjectAgentStatusMark({
  projectId,
  workspaceIds,
  rollupAttention = false,
  placement = "left_sidebar",
  size = 12,
  className,
}: {
  projectId: string;
  workspaceIds: readonly string[];
  /** When true, include child workspace attention (collapsed project row). */
  rollupAttention?: boolean;
  placement?: AgentIndicatorPlacement;
  size?: number;
  className?: string;
}) {
  const { view } = useProjectAgentStatusRollup(projectId, workspaceIds, {
    rollupAttention,
  });
  return <>{renderStatusView(view, placement, size, className)}</>;
}
