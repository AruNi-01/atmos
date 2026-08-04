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

/** Open Settings → Desktop Use via URL params (no full page reload when nuqs is active). */
export function openDesktopUseSettingsInApp(): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.searchParams.set("settingsModal", "true");
  url.searchParams.set("activeSettingTab", "desktop-use");
  url.searchParams.delete("appshotPermissions");
  const next = `${url.pathname}?${url.searchParams.toString()}${url.hash}`;
  // Prefer history mutation so SPA / nuqs can pick up the change without hard reload.
  window.history.pushState(window.history.state, "", next);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

/** Hook: open Settings → Desktop Use (same path as other header settings CTAs). */
export function useOpenDesktopUseSettings(): () => void {
  const [, setIsSettingsOpen] = useQueryState(
    "settingsModal",
    settingsModalParams.settingsModal,
  );
  const [, setActiveSettingTab] = useQueryState(
    "activeSettingTab",
    settingsModalParams.activeSettingTab,
  );

  return useCallback(() => {
    void setActiveSettingTab("desktop-use");
    void setIsSettingsOpen(true);
  }, [setActiveSettingTab, setIsSettingsOpen]);
}
