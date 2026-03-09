'use client';

import { create } from 'zustand';
import { functionSettingsApi } from '@/api/ws-api';
import { toastManager } from '@workspace/ui';

interface EditorSettingsState {
  autoSave: boolean;
  lineWrap: boolean;
  loaded: boolean;
  loading: boolean;
  loadSettings: () => Promise<void>;
  setAutoSave: (autoSave: boolean) => Promise<void>;
  setLineWrap: (lineWrap: boolean) => Promise<void>;
}

export const useEditorSettings = create<EditorSettingsState>((set, get) => ({
  autoSave: false,
  lineWrap: false,
  loaded: false,
  loading: false,

  loadSettings: async () => {
    if (get().loaded || get().loading) return;

    set({ loading: true });

    try {
      const settings = await functionSettingsApi.get();
      set({
        autoSave: settings.editor?.auto_save ?? false,
        lineWrap: settings.editor?.line_wrap ?? false,
        loaded: true,
        loading: false,
      });
    } catch {
      set({ loaded: true, loading: false });
    }
  },

  setLineWrap: async (lineWrap) => {
    const previous = get().lineWrap;
    set({ lineWrap });

    try {
      await functionSettingsApi.update('editor', 'line_wrap', lineWrap);
    } catch {
      set({ lineWrap: previous });
      toastManager.add({
        title: 'Settings Sync Failed',
        description: 'Failed to update the global editor setting.',
        type: 'error',
      });
    }
  },

  setAutoSave: async (autoSave) => {
    const previous = get().autoSave;
    set({ autoSave });

    try {
      await functionSettingsApi.update('editor', 'auto_save', autoSave);
    } catch {
      set({ autoSave: previous });
      toastManager.add({
        title: 'Settings Sync Failed',
        description: 'Failed to update the global editor setting.',
        type: 'error',
      });
    }
  },
}));
