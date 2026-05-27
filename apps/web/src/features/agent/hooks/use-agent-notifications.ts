"use client";

import { useEffect, useRef, useCallback } from "react";
import { useWebSocketStore } from "@/features/connection/hooks/use-websocket";
import { AGENT_STATE } from "@/features/agent/store/agent-hooks-store";
import { useNotificationSettingsStore } from "@/features/settings/store/notification-settings-store";
import {
  showBrowserNotification,
  showDesktopNotification,
} from "@/shared/lib/notifications";

interface AgentNotificationPayload {
  title: string;
  body: string;
  tool: string;
  state: string;
  session_id: string;
  project_path?: string | null;
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
}
