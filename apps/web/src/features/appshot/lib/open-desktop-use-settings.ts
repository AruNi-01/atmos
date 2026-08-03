"use client";

/**
 * Primary recovery path for Desktop Use / AppShot permissions (APP-052):
 * open Settings modal on the Desktop Use section instead of a standalone window.
 */

export function openDesktopUseSettingsInApp(): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.searchParams.set("settingsModal", "true");
  url.searchParams.set("activeSettingTab", "desktop-use");
  url.searchParams.delete("appshotPermissions");
  // Full navigation so nuqs + Settings modal reliably open on Desktop Use.
  window.location.assign(`${url.pathname}?${url.searchParams.toString()}${url.hash}`);
}
