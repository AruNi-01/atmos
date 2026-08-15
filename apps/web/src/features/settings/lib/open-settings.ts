"use client";

import { useCallback } from "react";

import type { SettingsModalTab } from "@/shared/lib/nuqs/searchParams";
import { useAppRouter } from "@/shared/hooks/use-app-router";
import {
  findSettingsReturnHref,
  rememberSettingsReturnPath,
  resolveStoredSettingsReturnPath,
} from "@/features/settings/lib/settings-return";

type NavigationLike = {
  entries?: () => Array<{ url?: string }>;
};

export function settingsHref(tab?: SettingsModalTab | null): string {
  if (!tab) return "/settings";
  return `/settings?activeSettingTab=${tab}`;
}

export function leaveSettingsPage(router: { replace: (path: string) => void }): void {
  if (typeof window === "undefined") {
    router.replace("/");
    return;
  }

  const navigation = (window as Window & { navigation?: NavigationLike }).navigation;
  const entries = navigation?.entries?.() ?? [];
  const fromHistory = findSettingsReturnHref(entries, window.location.origin);
  router.replace(fromHistory ?? resolveStoredSettingsReturnPath() ?? "/");
}

export function useOpenSettings() {
  const router = useAppRouter();

  return useCallback(
    (tab?: SettingsModalTab | null) => {
      rememberSettingsReturnPath();
      router.push(settingsHref(tab));
    },
    [router],
  );
}
