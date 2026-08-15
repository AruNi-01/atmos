"use client";

/**
 * Primary recovery path for Desktop Use / AppShot permissions (APP-052):
 * open the fullscreen Settings page on Desktop Use / Permission access.
 *
 * Prefer `useOpenDesktopUseSettings()` in React components (router.push).
 * This function is a non-hook fallback for rare non-React call sites.
 */

import { useCallback } from "react";
import {
  settingsHref,
  useOpenSettings,
} from "@/features/settings/lib/open-settings";

function openSettingsTabInApp(tab: "desktop-use" | "permission-access"): void {
  if (typeof window === "undefined") return;
  window.location.assign(settingsHref(tab));
}

/** Open Settings → Desktop Use (engine / CLI). */
export function openDesktopUseSettingsInApp(): void {
  openSettingsTabInApp("desktop-use");
}

/** Open Settings → Privacy & Security → Permission access (OS / cookie grants). */
export function openPermissionAccessSettingsInApp(): void {
  openSettingsTabInApp("permission-access");
}

function useOpenSettingsTab(tab: "desktop-use" | "permission-access"): () => void {
  const openSettings = useOpenSettings();
  return useCallback(() => {
    openSettings(tab);
  }, [openSettings, tab]);
}

/** Hook: open Settings → Desktop Use (engine / CLI). */
export function useOpenDesktopUseSettings(): () => void {
  return useOpenSettingsTab("desktop-use");
}

/** Hook: open Settings → Permission access (TCC + browser-cookie grants). */
export function useOpenPermissionAccessSettings(): () => void {
  return useOpenSettingsTab("permission-access");
}
