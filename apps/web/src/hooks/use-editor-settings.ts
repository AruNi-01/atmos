'use client';

import { create } from 'zustand';
import { functionSettingsApi } from '@/api/ws-api';
import { useFunctionSettingsStore } from '@/hooks/use-function-settings-store';
import { toastManager } from '@workspace/ui';

interface EditorSettingsState {
  autoSave: boolean;
  lineWrap: boolean;
  bracketMatching: boolean;
  minimap: boolean;
  breadcrumbs: boolean;
  lineHighlight: boolean;
  gitIntegration: boolean;
  loaded: boolean;
  loading: boolean;
  loadSettings: () => Promise<void>;
  setAutoSave: (autoSave: boolean) => Promise<void>;
  setLineWrap: (lineWrap: boolean) => Promise<void>;
  setBracketMatching: (bracketMatching: boolean) => Promise<void>;
  setMinimap: (minimap: boolean) => Promise<void>;
  setBreadcrumbs: (breadcrumbs: boolean) => Promise<void>;
  setLineHighlight: (lineHighlight: boolean) => Promise<void>;
  setGitIntegration: (gitIntegration: boolean) => Promise<void>;
}

export const useEditorSettings = create<EditorSettingsState>((set, get) => ({
  autoSave: false,
  lineWrap: true,
  bracketMatching: true,
  minimap: false,
  breadcrumbs: true,
  lineHighlight: true,
  gitIntegration: false,
  loaded: false,
  loading: false,

  loadSettings: async () => {
    if (get().loaded || get().loading) return;

    set({ loading: true });

    try {
      const settings = await useFunctionSettingsStore.getState().load();
      set({
        autoSave: settings.editor?.auto_save ?? false,
        lineWrap: settings.editor?.line_wrap ?? true,
        bracketMatching: settings.editor?.bracket_matching ?? true,
        minimap: settings.editor?.minimap ?? false,
        breadcrumbs: settings.editor?.breadcrumbs ?? true,
        lineHighlight: settings.editor?.line_highlight ?? true,
        gitIntegration: settings.editor?.git_integration ?? false,
        loaded: true,
        loading: false,
      });
    } catch {
      set({ loaded: false, loading: false });
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

  setBracketMatching: async (bracketMatching) => {
    const previous = get().bracketMatching;
    set({ bracketMatching });

    try {
      await functionSettingsApi.update('editor', 'bracket_matching', bracketMatching);
    } catch {
      set({ bracketMatching: previous });
      toastManager.add({
        title: 'Settings Sync Failed',
        description: 'Failed to update the global editor setting.',
        type: 'error',
      });
    }
  },

  setMinimap: async (minimap) => {
    const previous = get().minimap;
    set({ minimap });

    try {
      await functionSettingsApi.update('editor', 'minimap', minimap);
    } catch {
      set({ minimap: previous });
      toastManager.add({
        title: 'Settings Sync Failed',
        description: 'Failed to update the global editor setting.',
        type: 'error',
      });
    }
  },

  setBreadcrumbs: async (breadcrumbs) => {
    const previous = get().breadcrumbs;
    set({ breadcrumbs });

    try {
      await functionSettingsApi.update('editor', 'breadcrumbs', breadcrumbs);
    } catch {
      set({ breadcrumbs: previous });
      toastManager.add({
        title: 'Settings Sync Failed',
        description: 'Failed to update the global editor setting.',
        type: 'error',
      });
    }
  },

  setLineHighlight: async (lineHighlight) => {
    const previous = get().lineHighlight;
    set({ lineHighlight });

    try {
      await functionSettingsApi.update('editor', 'line_highlight', lineHighlight);
    } catch {
      set({ lineHighlight: previous });
      toastManager.add({
        title: 'Settings Sync Failed',
        description: 'Failed to update the global editor setting.',
        type: 'error',
      });
    }
  },

  setGitIntegration: async (gitIntegration) => {
    const previous = get().gitIntegration;
    set({ gitIntegration });

    try {
      await functionSettingsApi.update('editor', 'git_integration', gitIntegration);
    } catch {
      set({ gitIntegration: previous });
      toastManager.add({
        title: 'Settings Sync Failed',
        description: 'Failed to update the global editor setting.',
        type: 'error',
      });
    }
  },
}));
