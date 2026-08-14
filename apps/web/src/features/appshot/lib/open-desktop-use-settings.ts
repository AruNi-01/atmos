"use client";

/**
 * Primary recovery path for Desktop Use / AppShot permissions (APP-052):
 * open Settings modal on the Desktop Use section instead of a standalone window.
 *
 * Prefer `useOpenDesktopUseSettings()` in React components (nuqs, no full reload).
 * This function is a non-hook fallback for rare non-React call sites.
 */

import { useCallback } from "react";
import { useQueryState } from "nuqs";
import { settingsModalParams } from "@/shared/lib/nuqs/searchParams";

function openSettingsTabInApp(tab: "desktop-use" | "permission-access"): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.searchParams.set("settingsModal", "true");
  url.searchParams.set("activeSettingTab", tab);
  url.searchParams.delete("appshotPermissions");
  const next = `${url.pathname}?${url.searchParams.toString()}${url.hash}`;
  window.history.pushState(window.history.state, "", next);
  window.dispatchEvent(new PopStateEvent("popstate"));
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
  const [, setIsSettingsOpen] = useQueryState(
    "settingsModal",
    settingsModalParams.settingsModal,
  );
  const [, setActiveSettingTab] = useQueryState(
    "activeSettingTab",
    settingsModalParams.activeSettingTab,
  );

  return useCallback(() => {
    void setActiveSettingTab(tab);
    void setIsSettingsOpen(true);
  }, [setActiveSettingTab, setIsSettingsOpen, tab]);
}

/** Hook: open Settings → Desktop Use (engine / CLI). */
export function useOpenDesktopUseSettings(): () => void {
  return useOpenSettingsTab("desktop-use");
}

/** Hook: open Settings → Permission access (TCC + browser-cookie grants). */
export function useOpenPermissionAccessSettings(): () => void {
  return useOpenSettingsTab("permission-access");
}
