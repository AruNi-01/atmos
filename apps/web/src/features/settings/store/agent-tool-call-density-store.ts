"use client";

import { create } from "zustand";
import { functionSettingsApi } from "@/api/ws/settings-api";
import { useFunctionSettingsStore } from "@/features/settings/store/function-settings-store";
import {
  DEFAULT_TOOL_CALL_DENSITY,
  normalizeToolCallDensity,
  type ToolCallDensity,
} from "@/features/agent/lib/tool-call-density";

interface AgentToolCallDensityState {
  density: ToolCallDensity;
  loaded: boolean;
  loading: boolean;
  loadSettings: (force?: boolean) => Promise<void>;
  setDensity: (density: ToolCallDensity) => Promise<void>;
}

function readDensity(settings: { agent_cli?: { tool_call_density?: unknown } } | null | undefined): ToolCallDensity {
  return normalizeToolCallDensity(settings?.agent_cli?.tool_call_density);
}

export const useAgentToolCallDensityStore = create<AgentToolCallDensityState>((set, get) => ({
  density: DEFAULT_TOOL_CALL_DENSITY,
  loaded: false,
  loading: false,

  loadSettings: async (force = false) => {
    if (!force && (get().loaded || get().loading)) return;
    set({ loading: true });
    try {
      const settings = await useFunctionSettingsStore.getState().load();
      set({
        density: readDensity(settings),
        loaded: true,
        loading: false,
      });
    } catch {
      set({ loading: false });
    }
  },

  setDensity: async (density) => {
    const previous = get().density;
    if (previous === density) return;
    set({ density, loaded: true });
    try {
      await functionSettingsApi.update("agent_cli", "tool_call_density", density);
      useFunctionSettingsStore.getState().invalidate();
      await useFunctionSettingsStore.getState().load();
      set({
        density: readDensity(useFunctionSettingsStore.getState().settings),
        loaded: true,
      });
    } catch {
      set({ density: previous });
    }
  },
}));
