"use client";

import { create } from "zustand";
import { functionSettingsApi } from "@/api/ws/settings-api";
import { useFunctionSettingsStore } from "@/features/settings/store/function-settings-store";

/** Default: show detected agent brand text next to the icon in pane/tab titles. */
export const DEFAULT_SHOW_AGENT_NAME_IN_TERMINAL_TITLES = true;

const SETTING_KEY = "show_agent_name_in_terminal_titles" as const;

export function readShowAgentNameInTerminalTitles(
  settings: { agent_cli?: { show_agent_name_in_terminal_titles?: boolean } } | null | undefined,
): boolean {
  const value = settings?.agent_cli?.show_agent_name_in_terminal_titles;
  return typeof value === "boolean" ? value : DEFAULT_SHOW_AGENT_NAME_IN_TERMINAL_TITLES;
}

interface AgentTitleSettingsState {
  showAgentNameInTerminalTitles: boolean;
  loaded: boolean;
  loading: boolean;
  loadSettings: (force?: boolean) => Promise<void>;
  setShowAgentNameInTerminalTitles: (value: boolean) => Promise<void>;
}

export const useAgentTitleSettingsStore = create<AgentTitleSettingsState>((set, get) => ({
  showAgentNameInTerminalTitles: DEFAULT_SHOW_AGENT_NAME_IN_TERMINAL_TITLES,
  loaded: false,
  loading: false,

  loadSettings: async (force = false) => {
    if (!force && (get().loaded || get().loading)) return;
    set({ loading: true });
    try {
      const settings = await useFunctionSettingsStore.getState().load();
      set({
        showAgentNameInTerminalTitles: readShowAgentNameInTerminalTitles(settings),
        loaded: true,
        loading: false,
      });
    } catch {
      set({ loading: false });
    }
  },

  setShowAgentNameInTerminalTitles: async (value) => {
    const previous = get().showAgentNameInTerminalTitles;
    if (previous === value) return;
    set({ showAgentNameInTerminalTitles: value });
    try {
      await functionSettingsApi.update("agent_cli", SETTING_KEY, value);
      useFunctionSettingsStore.getState().invalidate();
      await useFunctionSettingsStore.getState().load();
      set({
        showAgentNameInTerminalTitles: readShowAgentNameInTerminalTitles(
          useFunctionSettingsStore.getState().settings,
        ),
        loaded: true,
      });
    } catch {
      set({ showAgentNameInTerminalTitles: previous });
      throw new Error("Failed to update agent name display setting");
    }
  },
}));
