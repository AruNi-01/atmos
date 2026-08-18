"use client";

import { getAgentIconCandidates } from "@/features/agent/lib/agent-icon-candidates";
import {
  AGENT_TOOL_ICON_IDS,
  type AgentToolType,
} from "@/features/agent/store/agent-hooks-store";
import { desktopInvoke, isDesktopRuntime } from "@/shared/lib/desktop-bridge";

export interface AppNotificationPayload {
  title: string;
  body: string;
}

export interface BrowserNotificationOptions {
  tag?: string;
  icon?: string;
  requireInteraction?: boolean;
  /** Called when the user clicks the browser system notification. */
  onClick?: () => void;
}

/**
 * Click payload for desktop (and browser) system notifications.
 * Echoed back from Electron on click so the web app can jump like in-app toast.
 */
export type NotificationClickAction =
  | {
      kind: "agent_hook";
      session_id: string;
      context_id?: string | null;
      pane_id?: string | null;
      side_chat_id?: string | null;
      source_pane_id?: string | null;
      tool?: string;
      project_path?: string | null;
    }
  | {
      kind: "automation";
      automation_guid: string;
      run_guid?: string | null;
    };

export interface DesktopNotificationOptions {
  action?: NotificationClickAction | null;
  /**
   * Content icon shown beside the title (left on macOS banners).
   * Prefer a PNG data URL so Electron/NativeImage can load it reliably.
   * The OS still attaches the Atmos app icon for identity (right on macOS).
   */
  icon?: string | null;
}

const DEFAULT_NOTIFICATION_ICON = "/notification-icon.png";
const NOTIFICATION_ICON_SIZE = 128;

/** Cache rasterized icons so repeated notifications stay cheap. */
const notificationIconDataUrlCache = new Map<string, string | null>();

/** True when the Atmos UI is visible and keyboard/mouse focused. */
export function isAppFocused(): boolean {
  if (typeof document === "undefined") return false;
  return document.visibilityState === "visible" && document.hasFocus();
}

/**
 * Whether browser/desktop system notifications should fire right now.
 * When `whenFocused` is false (default product behavior), suppress while the
 * user is actively using Atmos so in-app toasts can cover the foreground case.
 */
export function shouldShowSystemNotification(whenFocused: boolean): boolean {
  if (whenFocused) return true;
  return !isAppFocused();
}

export function isNotificationClickAction(
  value: unknown,
): value is NotificationClickAction {
  if (!value || typeof value !== "object") return false;
  const kind = (value as { kind?: unknown }).kind;
  if (kind === "agent_hook") {
    return typeof (value as { session_id?: unknown }).session_id === "string";
  }
  if (kind === "automation") {
    return typeof (value as { automation_guid?: unknown }).automation_guid === "string";
  }
  return false;
}

/** Build `/automations?...` deep link for an automation (and optional run). */
export function automationNotificationHref(
  automationGuid: string,
  runGuid?: string | null,
): string {
  const params = new URLSearchParams();
  params.set("automationId", automationGuid);
  if (runGuid) {
    params.set("automationRun", runGuid);
    params.set("automationTab", "history");
  }
  return `/automations?${params.toString()}`;
}

export function resolveAgentNotificationIconSrc(tool: string | null | undefined): string {
  if (!tool) return DEFAULT_NOTIFICATION_ICON;
  const registryId = AGENT_TOOL_ICON_IDS[tool as AgentToolType] ?? tool;
  const candidates = getAgentIconCandidates(registryId);
  // Prefer light/theme-pair first entry for light system banners.
  return candidates[0] ?? DEFAULT_NOTIFICATION_ICON;
}

/**
 * Rasterize a public asset (often SVG) to a PNG data URL for Electron Notification.
 * Falls back through candidates; returns null if nothing loads.
 */
export async function loadNotificationIconDataUrl(
  src: string,
): Promise<string | null> {
  if (!src) return null;
  if (src.startsWith("data:image/")) return src;
  if (notificationIconDataUrlCache.has(src)) {
    return notificationIconDataUrlCache.get(src) ?? null;
  }
  if (typeof window === "undefined" || typeof Image === "undefined") {
    return null;
  }

  const absolute =
    src.startsWith("http://") || src.startsWith("https://") || src.startsWith("data:")
      ? src
      : new URL(src, window.location.origin).toString();

  try {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const img = new Image();
      // Same-origin public assets; keep CORS friendly for canvas export.
      img.crossOrigin = "anonymous";
      img.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          canvas.width = NOTIFICATION_ICON_SIZE;
          canvas.height = NOTIFICATION_ICON_SIZE;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            reject(new Error("canvas unsupported"));
            return;
          }
          // Soft pad so logos aren't clipped against the rounded mask.
          const pad = Math.round(NOTIFICATION_ICON_SIZE * 0.08);
          ctx.clearRect(0, 0, NOTIFICATION_ICON_SIZE, NOTIFICATION_ICON_SIZE);
          ctx.drawImage(
            img,
            pad,
            pad,
            NOTIFICATION_ICON_SIZE - pad * 2,
            NOTIFICATION_ICON_SIZE - pad * 2,
          );
          resolve(canvas.toDataURL("image/png"));
        } catch (error) {
          reject(error);
        }
      };
      img.onerror = () => reject(new Error(`failed to load icon: ${src}`));
      img.src = absolute;
    });
    notificationIconDataUrlCache.set(src, dataUrl);
    return dataUrl;
  } catch {
    notificationIconDataUrlCache.set(src, null);
    return null;
  }
}

/** Resolve agent tool → PNG data URL for system notification content icon. */
export async function resolveAgentNotificationIconDataUrl(
  tool: string | null | undefined,
): Promise<string | null> {
  const primary = resolveAgentNotificationIconSrc(tool);
  const primaryData = await loadNotificationIconDataUrl(primary);
  if (primaryData) return primaryData;

  if (!tool) return loadNotificationIconDataUrl(DEFAULT_NOTIFICATION_ICON);

  const mapped = AGENT_TOOL_ICON_IDS[tool as AgentToolType] ?? tool;
  for (const candidate of getAgentIconCandidates(mapped)) {
    if (candidate === primary) continue;
    const data = await loadNotificationIconDataUrl(candidate);
    if (data) return data;
  }
  return loadNotificationIconDataUrl(DEFAULT_NOTIFICATION_ICON);
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

  const notification = new Notification(payload.title, {
    body: payload.body,
    icon: options.icon ?? DEFAULT_NOTIFICATION_ICON,
    tag: options.tag,
    requireInteraction: options.requireInteraction,
  });

  if (options.onClick) {
    notification.onclick = () => {
      try {
        window.focus();
      } catch {
        /* ignore */
      }
      options.onClick?.();
      notification.close();
    };
  }

  return true;
}

export async function showDesktopNotification(
  payload: AppNotificationPayload,
  options: DesktopNotificationOptions = {},
): Promise<boolean> {
  if (!isDesktopRuntime()) return false;
  try {
    const icon =
      options.icon === undefined
        ? await loadNotificationIconDataUrl(DEFAULT_NOTIFICATION_ICON)
        : options.icon;
    await desktopInvoke("send_notification", {
      title: payload.title,
      body: payload.body,
      data: options.action ?? null,
      // Content icon. When omitted, use the current brand plate so macOS does
      // not keep showing a cached pre-rebrand app icon.
      icon: icon ?? null,
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
