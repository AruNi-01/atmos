"use client";

import { useEffect, useRef, useCallback } from "react";
import { useWebSocketStore } from "@/hooks/use-websocket";
import { AGENT_STATE } from "@/hooks/use-agent-hooks-store";
import { useNotificationSettings } from "@/hooks/use-notification-settings";
import {
  showBrowserNotification,
  showDesktopNotification,
} from "@/lib/notifications";

interface AgentNotificationPayload {
  title: string;
  body: string;
  tool: string;
  state: string;
  session_id: string;
  project_path?: string | null;
}

export function useAgentNotifications() {
  const unsubscribeRef = useRef<(() => void) | null>(null);

  const handleNotification = useCallback((data: unknown) => {
    const payload = data as AgentNotificationPayload;
    const settings = useNotificationSettings.getState().settings;

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

  useEffect(() => {
    void useNotificationSettings.getState().loadSettings();
  }, []);

  useEffect(() => {
    unsubscribeRef.current = useWebSocketStore
      .getState()
      .onEvent("agent_notification", handleNotification);

    return () => {
      unsubscribeRef.current?.();
      unsubscribeRef.current = null;
    };
  }, [handleNotification]);
}
