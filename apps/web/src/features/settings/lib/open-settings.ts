"use client";

import { useCallback } from "react";

import type { SettingsModalTab } from "@/shared/lib/nuqs/searchParams";
import { useAppRouter } from "@/shared/hooks/use-app-router";

export function settingsHref(tab?: SettingsModalTab | null): string {
  if (!tab) return "/settings";
  return `/settings?activeSettingTab=${tab}`;
}

export function useOpenSettings() {
  const router = useAppRouter();

  return useCallback(
    (tab?: SettingsModalTab | null) => {
      router.push(settingsHref(tab));
    },
    [router],
  );
}
