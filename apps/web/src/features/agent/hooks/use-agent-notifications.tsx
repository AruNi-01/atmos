"use client";

import { useEffect, useRef, useCallback } from "react";
import { useTranslations } from "next-intl";
import type { AutomationNotificationPayload } from "@atmos/api-types/ws/dto/automation";
import type { AgentNotificationPayload } from "@atmos/api-types/ws/dto/events";
import { useWebSocketStore } from "@/features/connection/hooks/use-websocket";
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
  navigateToAgentStatusSession,
} from "@/features/agent/lib/agent-status-navigation";
import {
  sessionFromAgentNotification,
  showAgentStatusToast,
} from "@/features/agent/lib/agent-status-toast";
import {
  AGENT_STATE,
  type AgentStatusRecord,
} from "@/features/agent/store/agent-status-store";

function agentClickActionFromPayload(
  payload: AgentNotificationPayload,
): NotificationClickAction {
  const session = sessionFromAgentNotification(payload);
  return {
    kind: "agent_status",
    session_id: session.session_id,
    context_id: session.context_id ?? null,
    pane_id: session.pane_id ?? null,
    side_chat_id: session.side_chat_id ?? null,
    source_pane_id: session.source_pane_id ?? null,
    surface: session.surface ?? null,
    surface_id: session.surface_id ?? null,
    space_id: session.space_id ?? null,
    tool: session.tool,
    project_path: session.project_path ?? null,
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
  action: Extract<NotificationClickAction, { kind: "agent_status" }>,
): AgentStatusRecord {
  return sessionFromAgentNotification({
    title: "",
    body: "",
    tool: action.tool ?? "claude-code",
    state: AGENT_STATE.IDLE,
    session_id: action.session_id,
    project_path: action.project_path,
    context_id: action.context_id,
    pane_id: action.pane_id,
    side_chat_id: action.side_chat_id,
    source_pane_id: action.source_pane_id,
    surface: action.surface,
    surface_id: action.surface_id,
    space_id: action.space_id,
  });
}

export function useAgentNotifications() {
  const t = useTranslations("Agent.chrome");
  const unsubscribeAgentRef = useRef<(() => void) | null>(null);
  const unsubscribeAutomationRef = useRef<(() => void) | null>(null);
  const router = useAppRouter();
  const routerRef = useRef(router);
  routerRef.current = router;

  const handleNotificationClickAction = useCallback((action: NotificationClickAction) => {
    if (action.kind === "agent_status") {
      const projects = getProjectBootstrapSnapshot()?.projects ?? [];
      navigateToAgentStatusSession(
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

  const handleNotification = useCallback((payload: AgentNotificationPayload) => {
    const settings = useNotificationSettingsStore.getState().settings;

    if (settings.app_toast_notification) {
      showAgentStatusToast({ payload, router: routerRef.current, t });
    }

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
        requireInteraction: payload.reason === "permission_request"
          || payload.state === "permission_request",
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
  }, [handleNotificationClickAction, t]);

  const handleAutomationNotification = useCallback((payload: AutomationNotificationPayload) => {
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

    return () => {
      unsubscribeAgentRef.current?.();
      unsubscribeAutomationRef.current?.();
      unsubscribeAgentRef.current = null;
      unsubscribeAutomationRef.current = null;
    };
  }, [handleAutomationNotification, handleNotification]);

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
