"use client";

import { useCallback } from "react";

import type { SettingsModalTab } from "@/shared/lib/nuqs/searchParams";
import { useAppRouter } from "@/shared/hooks/use-app-router";
import { settingsHref } from "@/features/settings/lib/settings-last-section";
import {
  findSettingsReturnHref,
  rememberSettingsReturnPath,
  resolveStoredSettingsReturnPath,
} from "@/features/settings/lib/settings-return";

export { settingsHref } from "@/features/settings/lib/settings-last-section";

type NavigationLike = {
  entries?: () => Array<{ url?: string }>;
};

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
    (tab?: SettingsModalTab | null, hash?: string) => {
      rememberSettingsReturnPath();
      router.push(settingsHref(tab, hash));
    },
    [router],
  );
}
