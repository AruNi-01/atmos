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
import type { SettingsModalTab } from "@/shared/lib/nuqs/searchParams";

function openSettingsTabInApp(tab: SettingsModalTab, hash?: string): void {
  if (typeof window === "undefined") return;
  window.location.assign(settingsHref(tab, hash));
}

/** Open Settings → Apps → Desktop Use (engine / CLI). */
export function openDesktopUseSettingsInApp(): void {
  openSettingsTabInApp("apps", "desktop-use");
}

/** Open Settings → Privacy (OS / cookie grants). */
export function openPermissionAccessSettingsInApp(): void {
  openSettingsTabInApp("privacy");
}

function useOpenSettingsTab(tab: SettingsModalTab, hash?: string): () => void {
  const openSettings = useOpenSettings();
  return useCallback(() => {
    openSettings(tab, hash);
  }, [openSettings, tab, hash]);
}

/** Hook: open Settings → Apps → Desktop Use (engine / CLI). */
export function useOpenDesktopUseSettings(): () => void {
  return useOpenSettingsTab("apps", "desktop-use");
}

/** Hook: open Settings → Privacy (TCC + browser-cookie grants). */
export function useOpenPermissionAccessSettings(): () => void {
  return useOpenSettingsTab("privacy");
}
