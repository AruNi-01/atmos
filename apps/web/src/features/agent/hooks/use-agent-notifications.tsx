"use client";

import { useEffect, useRef, useCallback } from "react";
import { agentToastManager } from "@workspace/ui";
import { useWebSocketStore } from "@/features/connection/hooks/use-websocket";
import {
  AGENT_STATE,
  AGENT_TOOL_ICON_IDS,
  AGENT_TOOL_LABELS,
  useAgentHooksStore,
  type AgentHookSession,
  type AgentHookState,
  type AgentToolType,
} from "@/features/agent/store/agent-hooks-store";
import { AgentIcon } from "@/features/agent/components/AgentIcon";
import { useNotificationSettingsStore } from "@/features/settings/store/notification-settings-store";
import {
  showBrowserNotification,
  showDesktopNotification,
} from "@/shared/lib/notifications";
import { useProjectStore } from "@/features/project/store/use-project-store";
import { useAppRouter } from "@/shared/hooks/use-app-router";
import {
  navigateToAgentHookSessionPane,
  resolveAgentHookContextNames,
} from "@/features/agent/lib/agent-hook-navigation";

interface AgentNotificationPayload {
  title: string;
  body: string;
  tool: string;
  state: string;
  session_id: string;
  project_path?: string | null;
}

interface AgentHookStateUpdatePayload {
  session_id: string;
  tool: AgentToolType;
  state: AgentHookState;
  timestamp: string;
  project_path?: string | null;
  context_id?: string | null;
  pane_id?: string | null;
}

interface AutomationNotificationPayload {
  title: string;
  body: string;
  automation_guid: string;
  automation_display_name: string;
  run_guid: string;
  status: string;
  result_path?: string | null;
}

export function useAgentNotifications() {
  const unsubscribeAgentRef = useRef<(() => void) | null>(null);
  const unsubscribeAutomationRef = useRef<(() => void) | null>(null);
  const unsubscribeAgentHookToastRef = useRef<(() => void) | null>(null);
  const previousAgentHookStateRef = useRef<Map<string, AgentHookState>>(new Map());
  const router = useAppRouter();

  const handleNotification = useCallback((data: unknown) => {
    const payload = data as AgentNotificationPayload;
    const settings = useNotificationSettingsStore.getState().settings;

    if (settings.browser_notification) {
      showBrowserNotification(payload, {
        tag: `atmos-agent-${payload.session_id}`,
        requireInteraction: payload.state === AGENT_STATE.PERMISSION_REQUEST,
      });
    }

    if (settings.desktop_notification) {
      void showDesktopNotification(payload);
    }
  }, []);

  const handleAutomationNotification = useCallback((data: unknown) => {
    const payload = data as AutomationNotificationPayload;
    const settings = useNotificationSettingsStore.getState().settings;

    if (!settings.notify_on_automation_outcome) {
      return;
    }

    if (settings.browser_notification) {
      showBrowserNotification(payload, {
        tag: `atmos-automation-${payload.run_guid}`,
        requireInteraction: payload.status !== "completed",
      });
    }

    if (settings.desktop_notification) {
      void showDesktopNotification(payload);
    }
  }, []);

  const handleAgentHookToastNotification = useCallback((data: unknown) => {
    const update = data as AgentHookStateUpdatePayload;
    const settings = useNotificationSettingsStore.getState().settings;
    const previousState = previousAgentHookStateRef.current.get(update.session_id);
    previousAgentHookStateRef.current.set(update.session_id, update.state);

    if (!settings.app_toast_notification) {
      return;
    }

    const isPermissionRequest =
      settings.notify_on_permission_request &&
      update.state === AGENT_STATE.PERMISSION_REQUEST &&
      previousState !== AGENT_STATE.PERMISSION_REQUEST;

    const isComplete =
      settings.notify_on_task_complete &&
      update.state === AGENT_STATE.IDLE &&
      previousState === AGENT_STATE.RUNNING;

    if (!isPermissionRequest && !isComplete) {
      return;
    }

    const projects = useProjectStore.getState().projects;
    const session: AgentHookSession = {
      session_id: update.session_id,
      tool: update.tool,
      state: update.state,
      timestamp: update.timestamp,
      project_path: update.project_path,
      context_id: update.context_id,
      pane_id: update.pane_id,
    };
    const { projectName, workspaceName, workspaceDisplayName } =
      resolveAgentHookContextNames(update.context_id, update.project_path, projects);
    const agentName = AGENT_TOOL_LABELS[update.tool] ?? update.tool;
    const statusLabel = isPermissionRequest ? "Permission required" : "Completed";
    const workspaceLabel = workspaceDisplayName ?? workspaceName;
    const contextLabel = [projectName, workspaceLabel].filter(Boolean).join(" / ");
    const canNavigate = Boolean(update.context_id && update.pane_id);
    const toastId = `agent-hook-${update.session_id}-${update.state}-${update.timestamp}`;

    agentToastManager.add({
      id: toastId,
      title: `${agentName}: ${statusLabel}`,
      description: contextLabel,
      type: isPermissionRequest ? "warning" : "success",
      timeout: isPermissionRequest ? 0 : 10000,
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
                navigateToAgentHookSessionPane(session, router, projects);
                agentToastManager.close(toastId);
              }}
            >
              Jump
            </button>
            <button
              type="button"
              className="inline-flex h-7 items-center rounded-md border border-border bg-background px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
              onClick={() => agentToastManager.close(toastId)}
            >
              Close
            </button>
          </>
        ),
      },
    });
  }, [router]);

  useEffect(() => {
    void useNotificationSettingsStore.getState().loadSettings();
  }, []);

  useEffect(() => {
    unsubscribeAgentRef.current = useWebSocketStore
      .getState()
      .onEvent("agent_notification", handleNotification);
    unsubscribeAutomationRef.current = useWebSocketStore
      .getState()
      .onEvent("automation_notification", handleAutomationNotification);
    previousAgentHookStateRef.current = new Map(
      useAgentHooksStore.getState().getAllSessions().map((session) => [
        session.session_id,
        session.state,
      ]),
    );
    unsubscribeAgentHookToastRef.current = useWebSocketStore
      .getState()
      .onEvent("agent_hook_state_changed", handleAgentHookToastNotification);

    return () => {
      unsubscribeAgentRef.current?.();
      unsubscribeAutomationRef.current?.();
      unsubscribeAgentHookToastRef.current?.();
      unsubscribeAgentRef.current = null;
      unsubscribeAutomationRef.current = null;
      unsubscribeAgentHookToastRef.current = null;
    };
  }, [handleAgentHookToastNotification, handleAutomationNotification, handleNotification]);
}
