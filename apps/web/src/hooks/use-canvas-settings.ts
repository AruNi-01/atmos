'use client';

import { create } from 'zustand';
import { functionSettingsApi } from '@/api/ws-api';
import { useFunctionSettingsStore } from '@/hooks/use-function-settings-store';
import { toastManager } from '@workspace/ui';

interface CanvasSettingsState {
  autoSaveInterval: number; // in seconds
  loaded: boolean;
  loading: boolean;
  loadSettings: () => Promise<void>;
  setAutoSaveInterval: (interval: number) => Promise<void>;
}

export const useCanvasSettings = create<CanvasSettingsState>((set, get) => ({
  autoSaveInterval: 1, // default 1 second
  loaded: false,
  loading: false,

  loadSettings: async () => {
    if (get().loaded || get().loading) return;

    set({ loading: true });

    try {
      const settings = await useFunctionSettingsStore.getState().load();
      set({
        autoSaveInterval: settings.canvas?.auto_save_interval ?? 1,
        loaded: true,
        loading: false,
      });
    } catch {
      set({ loading: false });
      toastManager.add({
        title: 'Settings Load Failed',
        description: 'Could not load canvas preferences from the server.',
        type: 'error',
      });
    }
  },

  setAutoSaveInterval: async (autoSaveInterval) => {
    const previous = get().autoSaveInterval;
    set({ autoSaveInterval });

    try {
      await functionSettingsApi.update('canvas', 'auto_save_interval', autoSaveInterval);
    } catch {
      set({ autoSaveInterval: previous });
      toastManager.add({
        title: 'Settings Sync Failed',
        description: 'Failed to update the canvas auto-save interval.',
        type: 'error',
      });
    }
  },
}));
