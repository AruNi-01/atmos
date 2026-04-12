"use client";

import { isTauriRuntime } from "@/lib/desktop-runtime";

export interface AppNotificationPayload {
  title: string;
  body: string;
}

export interface BrowserNotificationOptions {
  tag?: string;
  requireInteraction?: boolean;
}

export async function requestBrowserNotificationPermission(): Promise<boolean> {
  if (typeof window === "undefined" || !("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  const result = await Notification.requestPermission();
  return result === "granted";
}

export function showBrowserNotification(
  payload: AppNotificationPayload,
  options: BrowserNotificationOptions = {},
): boolean {
  if (typeof window === "undefined" || !("Notification" in window)) return false;
  if (Notification.permission !== "granted") return false;

  new Notification(payload.title, {
    body: payload.body,
    icon: "/icon-192.png",
    tag: options.tag,
    requireInteraction: options.requireInteraction,
  });

  return true;
}

export async function showDesktopNotification(payload: AppNotificationPayload): Promise<boolean> {
  if (!isTauriRuntime()) return false;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("send_notification", {
      title: payload.title,
      body: payload.body,
    });
    return true;
  } catch {
    return false;
  }
}

export async function sendBrowserNotification(
  payload: AppNotificationPayload,
  options: BrowserNotificationOptions = {},
): Promise<boolean> {
  const granted = await requestBrowserNotificationPermission();
  if (!granted) return false;
  return showBrowserNotification(payload, options);
}
