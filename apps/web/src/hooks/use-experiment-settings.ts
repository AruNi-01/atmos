'use client';

import { create } from 'zustand';
import { functionSettingsApi } from '@/api/ws-api';
import { useFunctionSettingsStore } from '@/hooks/use-function-settings-store';

export interface ExperimentPrefs {
  managementTerminalsEnabled: boolean;
  managementAgentsEnabled: boolean;
  centerWikiTabEnabled: boolean;
}

interface ExperimentSettingsState extends ExperimentPrefs {
  loaded: boolean;
  loadSettings: () => Promise<void>;
  setManagementTerminalsEnabled: (value: boolean) => Promise<void>;
  setManagementAgentsEnabled: (value: boolean) => Promise<void>;
  setCenterWikiTabEnabled: (value: boolean) => Promise<void>;
}

function readExperiments(raw: unknown): ExperimentPrefs {
  const section =
    raw && typeof raw === 'object' && 'experiments' in raw
      ? (raw as { experiments?: unknown }).experiments
      : undefined;
  const ex = section && typeof section === 'object' ? (section as Record<string, unknown>) : undefined;
  return {
    managementTerminalsEnabled: ex?.mgmt_terminals === true,
    managementAgentsEnabled: ex?.mgmt_agents === true,
    centerWikiTabEnabled: ex?.center_wiki_tab === true,
  };
}

export const useExperimentSettings = create<ExperimentSettingsState>((set, get) => ({
  managementTerminalsEnabled: false,
  managementAgentsEnabled: false,
  centerWikiTabEnabled: false,
  loaded: false,

  loadSettings: async () => {
    if (get().loaded) return;
    try {
      const settings = await useFunctionSettingsStore.getState().load();
      const prefs = readExperiments(settings);
      set({ ...prefs, loaded: true });
    } catch {
      set({ loaded: true });
    }
  },

  setManagementTerminalsEnabled: async (value) => {
    const prev = get().managementTerminalsEnabled;
    set({ managementTerminalsEnabled: value });
    try {
      await functionSettingsApi.update('experiments', 'mgmt_terminals', value);
      useFunctionSettingsStore.getState().invalidate();
    } catch {
      set({ managementTerminalsEnabled: prev });
    }
  },

  setManagementAgentsEnabled: async (value) => {
    const prev = get().managementAgentsEnabled;
    set({ managementAgentsEnabled: value });
    try {
      await functionSettingsApi.update('experiments', 'mgmt_agents', value);
      useFunctionSettingsStore.getState().invalidate();
    } catch {
      set({ managementAgentsEnabled: prev });
    }
  },

  setCenterWikiTabEnabled: async (value) => {
    const prev = get().centerWikiTabEnabled;
    set({ centerWikiTabEnabled: value });
    try {
      await functionSettingsApi.update('experiments', 'center_wiki_tab', value);
      useFunctionSettingsStore.getState().invalidate();
    } catch {
      set({ centerWikiTabEnabled: prev });
    }
  },
}));
