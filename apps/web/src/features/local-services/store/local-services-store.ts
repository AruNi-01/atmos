"use client";

import { create } from "zustand";
import { createTranslator } from "next-intl";

import {
  localServicesApi,
  type LocalServicesScanRequest,
  type LocalServicesScanResponse,
} from "@/api/ws/local-services-api";
import enMessages from "../../../../messages/en.json";
import zhMessages from "../../../../messages/zh.json";
import { currentAppLocale } from "@/shared/lib/current-app-locale";

type ScopeState = {
  data: LocalServicesScanResponse | null;
  loading: boolean;
  error: string | null;
  lastLoadedAt: number;
};

interface LocalServicesStore {
  scopes: Record<string, ScopeState>;
  scan: (request: LocalServicesScanRequest) => Promise<LocalServicesScanResponse | null>;
  clear: (key: string) => void;
}

let cachedLocalServicesStoreLocale: "en" | "zh" | null = null;
let cachedLocalServicesStoreTranslator: any = null;

function localServicesStoreT(key: "scanFailed"): string {
  const locale = currentAppLocale("en") === "zh" ? "zh" : "en";
  if (!cachedLocalServicesStoreTranslator || cachedLocalServicesStoreLocale !== locale) {
    cachedLocalServicesStoreLocale = locale;
    cachedLocalServicesStoreTranslator = createTranslator({
      locale,
      messages: locale === "zh" ? zhMessages : enMessages,
      namespace: "localServices.store",
    });
  }
  return cachedLocalServicesStoreTranslator(key as never);
}

export function localServicesScopeKey(request: LocalServicesScanRequest): string {
  return [
    request.scope ?? "all_atmos_projects",
    request.project_id ?? "",
    request.workspace_id ?? "",
    request.include_diagnostics ? "diag" : "default",
  ].join(":");
}

const emptyScope = (): ScopeState => ({
  data: null,
  loading: false,
  error: null,
  lastLoadedAt: 0,
});

export const useLocalServicesStore = create<LocalServicesStore>((set, get) => ({
  scopes: {},

  scan: async (request) => {
    const key = localServicesScopeKey(request);
    const current = get().scopes[key] ?? emptyScope();
    set((state) => ({
      scopes: {
        ...state.scopes,
        [key]: {
          ...current,
          loading: true,
          error: null,
        },
      },
    }));

    try {
      const data = await localServicesApi.scan(request);
      set((state) => ({
        scopes: {
          ...state.scopes,
          [key]: {
            data,
            loading: false,
            error: null,
            lastLoadedAt: Date.now(),
          },
        },
      }));
      return data;
    } catch (error) {
      const message = error instanceof Error ? error.message : localServicesStoreT("scanFailed");
      set((state) => ({
        scopes: {
          ...state.scopes,
          [key]: {
            ...current,
            loading: false,
            error: message,
          },
        },
      }));
      return null;
    }
  },

  clear: (key) => {
    set((state) => {
      const next = { ...state.scopes };
      delete next[key];
      return { scopes: next };
    });
  },
}));
