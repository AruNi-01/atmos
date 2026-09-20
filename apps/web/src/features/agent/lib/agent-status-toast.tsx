"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { AgentNotificationPayload } from "@atmos/api-types/ws/dto/events";
import { agentToastManager } from "@workspace/ui";
import {
  AGENT_STATE,
  AGENT_TOOL_ICON_IDS,
  AGENT_TOOL_LABELS,
  useAgentStatusStore,
  type AgentStatusRecord,
  type AgentOccupancy,
  type AgentToolType,
} from "@/features/agent/store/agent-status-store";
import { AgentIcon } from "@/features/agent/components/AgentIcon";
import { getProjectBootstrapSnapshot } from "@/features/project/hooks/use-project-bootstrap-query";
import { useAppRouter } from "@/shared/hooks/use-app-router";
import {
  canNavigateToAgentStatusSession,
  isAgentStatusSideChatSession,
  navigateToAgentStatusSession,
  resolveAgentStatusContextNames,
} from "@/features/agent/lib/agent-status-navigation";

type AgentHookToastT = ReturnType<typeof useTranslations>;
type AppRouterLike = ReturnType<typeof useAppRouter>;

export function agentNotifyToastKind(
  payload: Pick<AgentNotificationPayload, "reason" | "state">,
): "permission" | "complete" | null {
  if (payload.reason === "permission_request" || payload.state === "permission_request") {
    return "permission";
  }
  if (payload.reason === "task_complete") {
    return "complete";
  }
  if (!payload.reason && payload.state === "idle") {
    return "complete";
  }
  return null;
}

export function sessionFromAgentNotification(
  payload: AgentNotificationPayload,
): AgentStatusRecord {
  const existing = useAgentStatusStore.getState().sessions.get(payload.session_id);
  const tool = (payload.tool as AgentToolType | undefined) ?? existing?.tool ?? "claude-code";
  const state = (payload.state as AgentOccupancy | undefined) ?? existing?.state ?? AGENT_STATE.IDLE;
  return {
    session_id: payload.session_id,
    tool,
    state,
    timestamp: existing?.timestamp ?? new Date().toISOString(),
    project_path: payload.project_path ?? existing?.project_path,
    context_id: payload.context_id ?? existing?.context_id,
    pane_id: payload.pane_id ?? existing?.pane_id,
    side_chat_id: payload.side_chat_id ?? existing?.side_chat_id,
    source_pane_id: payload.source_pane_id ?? existing?.source_pane_id,
    terminal_kind: existing?.terminal_kind,
    hook_version: existing?.hook_version,
    surface: (payload.surface as AgentStatusRecord["surface"]) ?? existing?.surface,
    surface_id: payload.surface_id ?? existing?.surface_id,
    space_id: payload.space_id ?? existing?.space_id,
    provider_id: payload.provider_id ?? existing?.provider_id,
  };
}

/**
 * In-app toast for occupancy notify intents (`agent_notification`).
 * Policy lives on the server; this only renders the channel.
 */
export function showAgentStatusToast(options: {
  payload: AgentNotificationPayload;
  router: AppRouterLike;
  t: AgentHookToastT;
}): void {
  const { payload, router, t } = options;
  const kind = agentNotifyToastKind(payload);
  if (!kind) return;

  const projects = getProjectBootstrapSnapshot()?.projects ?? [];
  const session = sessionFromAgentNotification(payload);
  const { projectName, workspaceName, workspaceDisplayName } =
    resolveAgentStatusContextNames(payload.context_id, payload.project_path, projects);
  const agentName = AGENT_TOOL_LABELS[session.tool] ?? payload.tool;
  const statusLabel = kind === "permission"
    ? t("notifications.permissionRequired")
    : t("notifications.completed");
  const workspaceLabel = workspaceDisplayName ?? workspaceName;
  const contextLabel = [
    projectName,
    workspaceLabel,
    isAgentStatusSideChatSession(session) ? t("notifications.sideChat") : null,
  ].filter(Boolean).join(" / ");
  const canNavigate = canNavigateToAgentStatusSession(session);
  const toastId = `agent-notify-${payload.session_id}-${kind}`;

  agentToastManager.add({
    id: toastId,
    title: `${agentName}: ${statusLabel}`,
    description: contextLabel,
    type: kind === "permission" ? "warning" : "success",
    timeout: 10000,
    data: {
      titlePrefix: (
        <AgentIcon
          registryId={AGENT_TOOL_ICON_IDS[session.tool] ?? session.tool}
          name={agentName}
          size={14}
        />
      ),
      actions: (
        <>
          <button
            type="button"
            className="inline-flex h-7 items-center rounded-md bg-primary px-2.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
            disabled={!canNavigate}
            onClick={() => {
              if (!canNavigate) return;
              const latestProjects =
                getProjectBootstrapSnapshot()?.projects ?? projects;
              navigateToAgentStatusSession(session, router, latestProjects);
              agentToastManager.close(toastId);
            }}
          >
            {t("notifications.jump")}
          </button>
          <button
            type="button"
            className="inline-flex h-7 items-center rounded-md border border-border bg-background px-2.5 text-xs font-medium text-foreground hover:bg-accent hover:text-accent-foreground"
            onClick={() => agentToastManager.close(toastId)}
          >
            {t("common.close")}
          </button>
        </>
      ),
    },
  });
}
