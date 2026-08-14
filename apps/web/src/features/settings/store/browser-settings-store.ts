"use client";

import { create } from "zustand";
import { functionSettingsApi } from "@/api/ws-api";
import { useFunctionSettingsStore } from "@/features/settings/store/function-settings-store";

export type BrowserDefaultSurface = "sidebar" | "center";

type BrowserSettingsState = {
  defaultSurface: BrowserDefaultSurface;
  newTabUrl: string;
  showAgentChrome: boolean;
  loaded: boolean;
  loading: boolean;
  loadSettings: (force?: boolean) => Promise<void>;
  setDefaultSurface: (value: BrowserDefaultSurface) => Promise<void>;
  setNewTabUrl: (value: string) => Promise<void>;
  setShowAgentChrome: (value: boolean) => Promise<void>;
};

function parseSurface(value: unknown): BrowserDefaultSurface {
  return value === "center" ? "center" : "sidebar";
}

let inflight: Promise<void> | null = null;

export const useBrowserSettingsStore = create<BrowserSettingsState>((set, get) => ({
  defaultSurface: "sidebar",
  newTabUrl: "",
  showAgentChrome: true,
  loaded: false,
  loading: false,

  loadSettings: async (force = false) => {
    if (get().loaded && !force) return;
    if (inflight) {
      await inflight;
      return;
    }
    set({ loading: true });
    inflight = (async () => {
      try {
        const settings = await useFunctionSettingsStore.getState().load();
        const browser = (settings.browser ?? {}) as {
          default_surface?: unknown;
          new_tab_url?: unknown;
          show_agent_chrome?: unknown;
        };
        set({
          defaultSurface: parseSurface(browser.default_surface),
          newTabUrl: typeof browser.new_tab_url === "string" ? browser.new_tab_url : "",
          showAgentChrome: browser.show_agent_chrome !== false,
          loaded: true,
          loading: false,
        });
      } catch {
        set({ loading: false, loaded: false });
      } finally {
        inflight = null;
      }
    })();
    await inflight;
  },

  setDefaultSurface: async (value) => {
    const previous = get().defaultSurface;
    set({ defaultSurface: value });
    try {
      await functionSettingsApi.update("browser", "default_surface", value);
    } catch {
      set({ defaultSurface: previous });
    }
  },

  setNewTabUrl: async (value) => {
    const previous = get().newTabUrl;
    set({ newTabUrl: value });
    try {
      await functionSettingsApi.update("browser", "new_tab_url", value);
    } catch {
      set({ newTabUrl: previous });
    }
  },

  setShowAgentChrome: async (value) => {
    const previous = get().showAgentChrome;
    set({ showAgentChrome: value });
    try {
      await functionSettingsApi.update("browser", "show_agent_chrome", value);
    } catch {
      set({ showAgentChrome: previous });
    }
  },
}));
