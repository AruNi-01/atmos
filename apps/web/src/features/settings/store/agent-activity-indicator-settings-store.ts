"use client";

import { create } from "zustand";
import { functionSettingsApi } from "@/api/ws/settings-api";
import { useFunctionSettingsStore } from "@/features/settings/store/function-settings-store";
import {
  DEFAULT_INDICATOR_BY_PLACEMENT,
  INDICATOR_SETTING_KEYS,
  type AgentActivityIndicatorId,
  type AgentIndicatorPlacement,
  resolveIndicatorId,
} from "@/features/agent/lib/agent-activity-indicator-styles";

export type AgentActivityIndicatorSettings = Record<
  AgentIndicatorPlacement,
  AgentActivityIndicatorId
>;

interface AgentActivityIndicatorSettingsState extends AgentActivityIndicatorSettings {
  loaded: boolean;
  loading: boolean;
  syncingPlacement: AgentIndicatorPlacement | null;
  loadSettings: (force?: boolean) => Promise<void>;
  setIndicator: (
    placement: AgentIndicatorPlacement,
    id: AgentActivityIndicatorId,
  ) => Promise<void>;
}

function readAll(
  settings: {
    agent_cli?: Partial<Record<string, unknown>>;
  } | null | undefined,
): AgentActivityIndicatorSettings {
  const agentCli = settings?.agent_cli ?? {};
  return {
    left_sidebar: resolveIndicatorId(
      agentCli[INDICATOR_SETTING_KEYS.left_sidebar],
      "left_sidebar",
    ),
    center_terminal: resolveIndicatorId(
      agentCli[INDICATOR_SETTING_KEYS.center_terminal],
      "center_terminal",
    ),
    terminal_panel: resolveIndicatorId(
      agentCli[INDICATOR_SETTING_KEYS.terminal_panel],
      "terminal_panel",
    ),
    footer: resolveIndicatorId(agentCli[INDICATOR_SETTING_KEYS.footer], "footer"),
  };
}

export const useAgentActivityIndicatorSettingsStore = create<AgentActivityIndicatorSettingsState>(
  (set, get) => ({
    ...DEFAULT_INDICATOR_BY_PLACEMENT,
    loaded: false,
    loading: false,
    syncingPlacement: null,

    loadSettings: async (force = false) => {
      if (!force && (get().loaded || get().loading)) return;
      set({ loading: true });
      try {
        const settings = await useFunctionSettingsStore.getState().load();
        set({
          ...readAll(settings),
          loaded: true,
          loading: false,
        });
      } catch {
        set({ loading: false });
      }
    },

    setIndicator: async (placement, id) => {
      const previous = get()[placement];
      if (previous === id) return;
      set({ [placement]: id, syncingPlacement: placement });
      try {
        await functionSettingsApi.update(
          "agent_cli",
          INDICATOR_SETTING_KEYS[placement],
          id,
        );
        useFunctionSettingsStore.getState().invalidate();
        await useFunctionSettingsStore.getState().load();
        set({
          ...readAll(useFunctionSettingsStore.getState().settings),
          loaded: true,
          syncingPlacement: null,
        });
      } catch {
        set({ [placement]: previous, syncingPlacement: null });
        throw new Error("Failed to update agent activity indicator setting");
      }
    },
  }),
);

export function useIndicatorIdForPlacement(
  placement: AgentIndicatorPlacement,
): AgentActivityIndicatorId {
  return useAgentActivityIndicatorSettingsStore((s) => s[placement]);
}
