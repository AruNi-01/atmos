'use client';

import { create } from 'zustand';
import { functionSettingsApi } from '@/api/ws-api';
import { useFunctionSettingsStore } from '@/hooks/use-function-settings-store';
import { toastManager } from '@workspace/ui';

interface CanvasSettingsState {
  autoSaveInterval: number; // in seconds
  maxRenderedTerminals: number;
  loaded: boolean;
  loading: boolean;
  loadSettings: () => Promise<void>;
  setAutoSaveInterval: (interval: number) => Promise<void>;
  setMaxRenderedTerminals: (count: number) => Promise<void>;
}

export const DEFAULT_CANVAS_AUTO_SAVE_INTERVAL = 1;
export const DEFAULT_CANVAS_MAX_RENDERED_TERMINALS = 10;
export const MIN_CANVAS_MAX_RENDERED_TERMINALS = 1;
export const MAX_CANVAS_MAX_RENDERED_TERMINALS = 50;

export const useCanvasSettings = create<CanvasSettingsState>((set, get) => ({
  autoSaveInterval: DEFAULT_CANVAS_AUTO_SAVE_INTERVAL,
  maxRenderedTerminals: DEFAULT_CANVAS_MAX_RENDERED_TERMINALS,
  loaded: false,
  loading: false,

  loadSettings: async () => {
    if (get().loaded || get().loading) return;

    set({ loading: true });

    try {
      const settings = await useFunctionSettingsStore.getState().load();
      set({
        autoSaveInterval: settings.canvas?.auto_save_interval ?? DEFAULT_CANVAS_AUTO_SAVE_INTERVAL,
        maxRenderedTerminals:
          settings.canvas?.max_rendered_terminals ?? DEFAULT_CANVAS_MAX_RENDERED_TERMINALS,
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

  setMaxRenderedTerminals: async (maxRenderedTerminals) => {
    const previous = get().maxRenderedTerminals;
    set({ maxRenderedTerminals });

    try {
      await functionSettingsApi.update('canvas', 'max_rendered_terminals', maxRenderedTerminals);
    } catch {
      set({ maxRenderedTerminals: previous });
      toastManager.add({
        title: 'Settings Sync Failed',
        description: 'Failed to update the canvas rendered terminal limit.',
        type: 'error',
      });
    }
  },
}));
