'use client';

import { createTranslator } from 'next-intl';
import { create } from 'zustand';
import { functionSettingsApi } from '@/api/ws-api';
import { useFunctionSettingsStore } from '@/features/settings/store/function-settings-store';
import { toastManager } from '@workspace/ui';
import { currentAppLocale } from '@/shared/lib/current-app-locale';
import enMessages from '../../../../messages/en.json';
import zhMessages from '../../../../messages/zh.json';

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

type SettingsLocale = 'en' | 'zh';

let cachedLocale: SettingsLocale | null = null;
let cachedTranslator: ReturnType<typeof createTranslator> | null = null;

function editorSettingsT(key: string, values?: Record<string, string | number>) {
  const locale: SettingsLocale = currentAppLocale('en') === 'zh' ? 'zh' : 'en';
  if (!cachedTranslator || cachedLocale !== locale) {
    cachedLocale = locale;
    cachedTranslator = createTranslator({
      locale,
      messages: locale === 'zh' ? zhMessages : enMessages,
      namespace: 'settings.store.editor',
    });
  }

  return cachedTranslator(key as never, values as never);
}

export const useEditorSettingsStore = create<EditorSettingsState>((set, get) => ({
  autoSave: false,
  lineWrap: true,
  bracketMatching: true,
  minimap: false,
  breadcrumbs: true,
  lineHighlight: true,
  gitIntegration: true,
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
        gitIntegration: settings.editor?.git_integration ?? true,
        loaded: true,
        loading: false,
      });
    } catch {
      set({ loading: false });
      toastManager.add({
        title: editorSettingsT('loadFailedTitle'),
        description: editorSettingsT('loadFailedDescription'),
        type: 'error',
      });
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
        title: editorSettingsT('syncFailedTitle'),
        description: editorSettingsT('syncFailedDescription'),
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
        title: editorSettingsT('syncFailedTitle'),
        description: editorSettingsT('syncFailedDescription'),
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
        title: editorSettingsT('syncFailedTitle'),
        description: editorSettingsT('syncFailedDescription'),
        type: 'error',
      });
    }
  },

  setMinimap: async (minimap) => {
    const previous = get().minimap;
    set({ minimap });

    try {
      await functionSettingsApi.update('editor', 'minimap', minimap);
      toastManager.add({
        title: editorSettingsT('reloadRequiredTitle'),
        description: editorSettingsT('reloadRequiredDescription'),
        type: 'info',
      });
    } catch {
      set({ minimap: previous });
      toastManager.add({
        title: editorSettingsT('syncFailedTitle'),
        description: editorSettingsT('syncFailedDescription'),
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
        title: editorSettingsT('syncFailedTitle'),
        description: editorSettingsT('syncFailedDescription'),
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
        title: editorSettingsT('syncFailedTitle'),
        description: editorSettingsT('syncFailedDescription'),
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
        title: editorSettingsT('syncFailedTitle'),
        description: editorSettingsT('syncFailedDescription'),
        type: 'error',
      });
    }
  },
}));
