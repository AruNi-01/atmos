"use client";

import { useEffect, useRef, useCallback } from "react";
import { useWebSocketStore } from "@/hooks/use-websocket";
import { useNotificationSettings } from "@/hooks/use-notification-settings";
import { isTauriRuntime } from "@/lib/desktop-runtime";

interface AgentNotificationPayload {
  title: string;
  body: string;
  tool: string;
  state: string;
  session_id: string;
  project_path?: string | null;
}

async function requestBrowserPermission(): Promise<boolean> {
  if (typeof window === "undefined" || !("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  const result = await Notification.requestPermission();
  return result === "granted";
}

function showBrowserNotification(payload: AgentNotificationPayload) {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;

  new Notification(payload.title, {
    body: payload.body,
    icon: "/icon-192.png",
    tag: `atmos-agent-${payload.session_id}`,
    requireInteraction: payload.state === "permission_request",
  });
}

async function showDesktopNotification(payload: AgentNotificationPayload) {
  if (!isTauriRuntime()) return;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("send_notification", {
      title: payload.title,
      body: payload.body,
    });
  } catch {
    // Tauri not available or command failed
  }
}

export function useAgentNotifications() {
  const unsubscribeRef = useRef<(() => void) | null>(null);

  const handleNotification = useCallback((data: unknown) => {
    const payload = data as AgentNotificationPayload;
    const settings = useNotificationSettings.getState().settings;

    if (settings.browser_notification) {
      showBrowserNotification(payload);
    }

    if (settings.desktop_notification) {
      void showDesktopNotification(payload);
    }
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

export async function ensureBrowserNotificationPermission(): Promise<boolean> {
  return requestBrowserPermission();
}
