"use client";

import { useCallback } from "react";
import { createTranslator } from "next-intl";
import { useTmuxStatusQuery } from "@/features/system/hooks/use-system-status-queries";
import { currentAppLocale } from "@/shared/lib/current-app-locale";
import enMessages from "../../../messages/en.json";
import zhMessages from "../../../messages/zh.json";

export interface TmuxCheckState {
  isLoading: boolean;
  isInstalled: boolean | null;
  version: string | null;
  error: string | null;
  refetch: () => Promise<void>;
}

interface UseTmuxCheckOptions {
  enabled?: boolean;
}

let cachedSharedLocale: "en" | "zh" | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cachedSharedTranslator: any = null;

function sharedT(key: string): string {
  const locale = currentAppLocale("en") === "zh" ? "zh" : "en";
  if (!cachedSharedTranslator || cachedSharedLocale !== locale) {
    cachedSharedLocale = locale;
    cachedSharedTranslator = createTranslator({
      locale,
      messages: locale === "zh" ? zhMessages : enMessages,
      namespace: "shared.tmuxCheck",
    });
  }
  return cachedSharedTranslator(key as never);
}

/**
 * Hook to check tmux installation status (APP-035: backed by TanStack Query).
 */
export function useTmuxCheck(options: UseTmuxCheckOptions = {}): TmuxCheckState {
  const { enabled = true } = options;
  const query = useTmuxStatusQuery({ enabled });

  const refetch = useCallback(async () => {
    await query.refetch();
  }, [query]);

  if (!enabled) {
    return {
      isLoading: false,
      isInstalled: null,
      version: null,
      error: null,
      refetch,
    };
  }

  return {
    isLoading: query.isPending,
    isInstalled: query.data?.installed ?? null,
    version: query.data?.version ?? null,
    error: query.error
      ? query.error instanceof Error
        ? query.error.message
        : sharedT("errors.failedToCheckStatus")
      : null,
    refetch,
  };
}
