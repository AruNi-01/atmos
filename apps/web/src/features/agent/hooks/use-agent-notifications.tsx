"use client";

import { useEffect, useRef, useCallback } from "react";
import { useTranslations } from "next-intl";
import { useWebSocketStore } from "@/features/connection/hooks/use-websocket";
import {
  AGENT_STATE,
  useAgentHooksStore,
  type AgentHookSession,
  type AgentHookState,
  type AgentToolType,
} from "@/features/agent/store/agent-hooks-store";
import { useNotificationSettingsStore } from "@/features/settings/store/notification-settings-store";
import {
  automationNotificationHref,
  isNotificationClickAction,
  resolveAgentNotificationIconDataUrl,
  resolveAgentNotificationIconSrc,
  shouldShowSystemNotification,
  showBrowserNotification,
  showDesktopNotification,
  type NotificationClickAction,
} from "@/shared/lib/notifications";
import { desktopListen, isDesktopRuntime } from "@/shared/lib/desktop-bridge";
import { getProjectBootstrapSnapshot } from "@/features/project/hooks/use-project-bootstrap-query";
import { useAppRouter } from "@/shared/hooks/use-app-router";
import {
  navigateToAgentHookSessionPane,
} from "@/features/agent/lib/agent-hook-navigation";
import {
  showAgentHookStateToast,
  type AgentHookStateUpdatePayload,
} from "@/features/agent/lib/agent-hook-toast";

interface AgentNotificationPayload {
  title: string;
  body: string;
  tool: string;
  state: string;
  session_id: string;
  project_path?: string | null;
  context_id?: string | null;
  pane_id?: string | null;
  side_chat_id?: string | null;
  source_pane_id?: string | null;
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

function agentClickActionFromPayload(
  payload: AgentNotificationPayload,
): NotificationClickAction {
  // Prefer payload fields; fall back to the live hooks store (same session).
  const session = useAgentHooksStore.getState().sessions.get(payload.session_id);
  return {
    kind: "agent_hook",
    session_id: payload.session_id,
    context_id: payload.context_id ?? session?.context_id ?? null,
    pane_id: payload.pane_id ?? session?.pane_id ?? null,
    side_chat_id: payload.side_chat_id ?? session?.side_chat_id ?? null,
    source_pane_id: payload.source_pane_id ?? session?.source_pane_id ?? null,
    tool: payload.tool ?? session?.tool,
    project_path: payload.project_path ?? session?.project_path ?? null,
  };
}

function automationClickActionFromPayload(
  payload: AutomationNotificationPayload,
): NotificationClickAction {
  return {
    kind: "automation",
    automation_guid: payload.automation_guid,
    run_guid: payload.run_guid,
  };
}

function sessionFromAgentAction(
  action: Extract<NotificationClickAction, { kind: "agent_hook" }>,
): AgentHookSession {
  const existing = useAgentHooksStore.getState().sessions.get(action.session_id);
  return {
    session_id: action.session_id,
    tool: (action.tool as AgentToolType | undefined) ?? existing?.tool ?? "claude-code",
    state: existing?.state ?? AGENT_STATE.IDLE,
    timestamp: existing?.timestamp ?? new Date().toISOString(),
    project_path: action.project_path ?? existing?.project_path,
    context_id: action.context_id ?? existing?.context_id,
    pane_id: action.pane_id ?? existing?.pane_id,
    side_chat_id: action.side_chat_id ?? existing?.side_chat_id,
    source_pane_id: action.source_pane_id ?? existing?.source_pane_id,
    terminal_kind: existing?.terminal_kind,
    hook_version: existing?.hook_version,
  };
}

export function useAgentNotifications() {
  const t = useTranslations("Agent.chrome");
  const unsubscribeAgentRef = useRef<(() => void) | null>(null);
  const unsubscribeAutomationRef = useRef<(() => void) | null>(null);
  const unsubscribeAgentHookToastRef = useRef<(() => void) | null>(null);
  const previousAgentHookStateRef = useRef<Map<string, AgentHookState>>(new Map());
  const router = useAppRouter();
  const routerRef = useRef(router);
  routerRef.current = router;

  const handleNotificationClickAction = useCallback((action: NotificationClickAction) => {
    if (action.kind === "agent_hook") {
      const projects = getProjectBootstrapSnapshot()?.projects ?? [];
      navigateToAgentHookSessionPane(
        sessionFromAgentAction(action),
        routerRef.current,
        projects,
      );
      return;
    }

    if (action.kind === "automation") {
      routerRef.current.push(
        automationNotificationHref(action.automation_guid, action.run_guid),
      );
    }
  }, []);

  const handleNotification = useCallback((data: unknown) => {
    const payload = data as AgentNotificationPayload;
    const settings = useNotificationSettingsStore.getState().settings;
    const showSystem = shouldShowSystemNotification(
      settings.system_notification_when_focused,
    );
    if (!showSystem) return;

    const action = agentClickActionFromPayload(payload);
    const browserIcon = resolveAgentNotificationIconSrc(payload.tool);

    if (settings.browser_notification) {
      showBrowserNotification(payload, {
        tag: `atmos-agent-${payload.session_id}`,
        icon: browserIcon,
        requireInteraction: payload.state === AGENT_STATE.PERMISSION_REQUEST,
        onClick: () => handleNotificationClickAction(action),
      });
    }

    if (settings.desktop_notification) {
      void (async () => {
        // Content icon = agent brand (left on macOS). App icon stays as Atmos identity.
        const icon = await resolveAgentNotificationIconDataUrl(payload.tool);
        await showDesktopNotification(payload, { action, icon });
      })();
    }
  }, [handleNotificationClickAction]);

  const handleAutomationNotification = useCallback((data: unknown) => {
    const payload = data as AutomationNotificationPayload;
    const settings = useNotificationSettingsStore.getState().settings;

    if (!settings.notify_on_automation_outcome) {
      return;
    }

    const showSystem = shouldShowSystemNotification(
      settings.system_notification_when_focused,
    );
    if (!showSystem) return;

    const action = automationClickActionFromPayload(payload);

    if (settings.browser_notification) {
      showBrowserNotification(payload, {
        tag: `atmos-automation-${payload.run_guid}`,
        requireInteraction: payload.status !== "completed",
        onClick: () => handleNotificationClickAction(action),
      });
    }

    if (settings.desktop_notification) {
      // Default brand plate (current saturn mark). Leaving icon unset lets
      // macOS reuse a cached pre-rebrand app icon on com.atmos.desktop.
      void showDesktopNotification(payload, { action });
    }
  }, [handleNotificationClickAction]);

  const handleAgentHookToastNotification = useCallback((data: unknown) => {
    const update = data as AgentHookStateUpdatePayload;
    const settings = useNotificationSettingsStore.getState().settings;
    const previousState = previousAgentHookStateRef.current.get(update.session_id);
    previousAgentHookStateRef.current.set(update.session_id, update.state);

    if (!settings.app_toast_notification) {
      return;
    }

    showAgentHookStateToast({
      update,
      previousState,
      notifyOnPermissionRequest: settings.notify_on_permission_request,
      notifyOnTaskComplete: settings.notify_on_task_complete,
      router,
      t,
    });
  }, [router, t]);

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

  // Desktop system notification click → focus app + jump (mirrors in-app toast Jump).
  useEffect(() => {
    if (!isDesktopRuntime()) return;
    let disposed = false;
    let unlisten: (() => void) | undefined;

    void desktopListen("notification-clicked", (payload) => {
      if (!isNotificationClickAction(payload)) return;
      handleNotificationClickAction(payload);
    }).then((off) => {
      if (disposed) {
        off();
        return;
      }
      unlisten = off;
    });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [handleNotificationClickAction]);
}
