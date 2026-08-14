"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { agentToastManager } from "@workspace/ui";
import {
  AGENT_STATE,
  AGENT_TOOL_ICON_IDS,
  AGENT_TOOL_LABELS,
  type AgentHookSession,
  type AgentHookState,
  type AgentToolType,
} from "@/features/agent/store/agent-hooks-store";
import { AgentIcon } from "@/features/agent/components/AgentIcon";
import { getProjectBootstrapSnapshot } from "@/features/project/hooks/use-project-bootstrap-query";
import { useAppRouter } from "@/shared/hooks/use-app-router";
import {
  canNavigateToAgentHookSession,
  isAgentHookSideChatSession,
  navigateToAgentHookSessionPane,
  resolveAgentHookContextNames,
} from "@/features/agent/lib/agent-hook-navigation";

export type AgentHookStateUpdatePayload = {
  session_id: string;
  tool: AgentToolType;
  state: AgentHookState;
  timestamp: string;
  project_path?: string | null;
  context_id?: string | null;
  pane_id?: string | null;
  terminal_kind?: string | null;
  side_chat_id?: string | null;
  source_pane_id?: string | null;
  hook_version?: number | null;
};

type AgentHookToastT = ReturnType<typeof useTranslations>;
type AppRouterLike = ReturnType<typeof useAppRouter>;

/**
 * Build and show an in-app toast for agent permission / task-complete transitions.
 * Extracted from the notification subscription hook so JSX stays out of the WS glue.
 */
export function showAgentHookStateToast(options: {
  update: AgentHookStateUpdatePayload;
  previousState: AgentHookState | undefined;
  notifyOnPermissionRequest: boolean;
  notifyOnTaskComplete: boolean;
  router: AppRouterLike;
  t: AgentHookToastT;
}): void {
  const {
    update,
    previousState,
    notifyOnPermissionRequest,
    notifyOnTaskComplete,
    router,
    t,
  } = options;

  const isPermissionRequest =
    notifyOnPermissionRequest &&
    update.state === AGENT_STATE.PERMISSION_REQUEST &&
    previousState !== AGENT_STATE.PERMISSION_REQUEST;

  const isComplete =
    notifyOnTaskComplete &&
    update.state === AGENT_STATE.IDLE &&
    previousState === AGENT_STATE.RUNNING;

  if (!isPermissionRequest && !isComplete) {
    return;
  }

  const projects = getProjectBootstrapSnapshot()?.projects ?? [];
  const session: AgentHookSession = {
    session_id: update.session_id,
    tool: update.tool,
    state: update.state,
    timestamp: update.timestamp,
    project_path: update.project_path,
    context_id: update.context_id,
    pane_id: update.pane_id,
    terminal_kind: update.terminal_kind,
    side_chat_id: update.side_chat_id,
    source_pane_id: update.source_pane_id,
    hook_version: update.hook_version,
  };
  const { projectName, workspaceName, workspaceDisplayName } =
    resolveAgentHookContextNames(update.context_id, update.project_path, projects);
  const agentName = AGENT_TOOL_LABELS[update.tool] ?? update.tool;
  const statusLabel = isPermissionRequest
    ? t("notifications.permissionRequired")
    : t("notifications.completed");
  const workspaceLabel = workspaceDisplayName ?? workspaceName;
  const contextLabel = [
    projectName,
    workspaceLabel,
    isAgentHookSideChatSession(update) ? t("notifications.sideChat") : null,
  ].filter(Boolean).join(" / ");
  const canNavigate = canNavigateToAgentHookSession(update);
  const toastId = `agent-hook-${update.session_id}-${update.state}-${update.timestamp}`;

  agentToastManager.add({
    id: toastId,
    title: `${agentName}: ${statusLabel}`,
    description: contextLabel,
    type: isPermissionRequest ? "warning" : "success",
    timeout: 10000,
    data: {
      titlePrefix: (
        <AgentIcon
          registryId={AGENT_TOOL_ICON_IDS[update.tool] ?? update.tool}
          name={agentName}
          size={14}
        />
      ),
      actions: (
        <>
          <button
            type="button"
            className="inline-flex h-7 items-center rounded-md bg-primary px-2.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
            disabled={!canNavigate}
            onClick={() => {
              if (!canNavigate) return;
              const latestProjects =
                getProjectBootstrapSnapshot()?.projects ?? projects;
              navigateToAgentHookSessionPane(session, router, latestProjects);
              agentToastManager.close(toastId);
            }}
          >
            {t("notifications.jump")}
          </button>
          <button
            type="button"
            className="inline-flex h-7 items-center rounded-md border border-border bg-background px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            onClick={() => agentToastManager.close(toastId)}
          >
            {t("common.close")}
          </button>
        </>
      ),
    },
  });
}
