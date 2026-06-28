'use client';

import { createTranslator } from 'next-intl';
import type { DiffIndicators } from '@pierre/diffs';
import { create } from 'zustand';
import { functionSettingsApi } from '@/api/ws-api';
import { useFunctionSettingsStore } from '@/features/settings/store/function-settings-store';
import { toastManager } from '@workspace/ui';
import { currentAppLocale } from '@/shared/lib/current-app-locale';
import enMessages from '../../../../messages/en.json';
import zhMessages from '../../../../messages/zh.json';

export type DiffSettingsStyle = 'split' | 'unified';

interface DiffSettingsState {
  diffStyle: DiffSettingsStyle;
  showBackgrounds: boolean;
  lineNumbers: boolean;
  wordWrap: boolean;
  diffIndicators: DiffIndicators;
  loaded: boolean;
  loading: boolean;
  loadSettings: () => Promise<void>;
  setDiffStyle: (diffStyle: DiffSettingsStyle) => Promise<void>;
  setShowBackgrounds: (showBackgrounds: boolean) => Promise<void>;
  setLineNumbers: (lineNumbers: boolean) => Promise<void>;
  setWordWrap: (wordWrap: boolean) => Promise<void>;
  setDiffIndicators: (diffIndicators: DiffIndicators) => Promise<void>;
}

const DEFAULT_DIFF_SETTINGS = {
  diffStyle: 'split' as DiffSettingsStyle,
  showBackgrounds: true,
  lineNumbers: true,
  wordWrap: false,
  diffIndicators: 'bars' as DiffIndicators,
};

type SettingsLocale = 'en' | 'zh';

let cachedLocale: SettingsLocale | null = null;
let cachedTranslator: any = null;

function diffSettingsT(key: string, values?: Record<string, string | number>) {
  const locale: SettingsLocale = currentAppLocale('en') === 'zh' ? 'zh' : 'en';
  if (!cachedTranslator || cachedLocale !== locale) {
    cachedLocale = locale;
    cachedTranslator = createTranslator({
      locale,
      messages: locale === 'zh' ? zhMessages : enMessages,
      namespace: 'settings.store.diff',
    });
  }

  return cachedTranslator(key as never, values as never);
}

function isDiffStyle(value: unknown): value is DiffSettingsStyle {
  return value === 'split' || value === 'unified';
}

function isDiffIndicators(value: unknown): value is DiffIndicators {
  return value === 'bars' || value === 'classic' || value === 'none';
}

async function updateDiffSetting(
  key: string,
  value: unknown,
  rollback: () => void,
) {
  try {
    await functionSettingsApi.update('diff', key, value);
    useFunctionSettingsStore.getState().invalidate();
  } catch {
    rollback();
    toastManager.add({
      title: diffSettingsT('syncFailedTitle'),
      description: diffSettingsT('syncFailedDescription'),
      type: 'error',
    });
  }
}

export const useDiffSettingsStore = create<DiffSettingsState>((set, get) => ({
  ...DEFAULT_DIFF_SETTINGS,
  loaded: false,
  loading: false,

  loadSettings: async () => {
    if (get().loaded || get().loading) return;

    set({ loading: true });

    try {
      const settings = await useFunctionSettingsStore.getState().load();
      set({
        diffStyle: isDiffStyle(settings.diff?.diff_style)
          ? settings.diff.diff_style
          : DEFAULT_DIFF_SETTINGS.diffStyle,
        showBackgrounds:
          settings.diff?.show_backgrounds ?? DEFAULT_DIFF_SETTINGS.showBackgrounds,
        lineNumbers: settings.diff?.line_numbers ?? DEFAULT_DIFF_SETTINGS.lineNumbers,
        wordWrap: settings.diff?.word_wrap ?? DEFAULT_DIFF_SETTINGS.wordWrap,
        diffIndicators: isDiffIndicators(settings.diff?.diff_indicators)
          ? settings.diff.diff_indicators
          : DEFAULT_DIFF_SETTINGS.diffIndicators,
        loaded: true,
        loading: false,
      });
    } catch {
      set({ loading: false });
      toastManager.add({
        title: diffSettingsT('loadFailedTitle'),
        description: diffSettingsT('loadFailedDescription'),
        type: 'error',
      });
    }
  },

  setDiffStyle: async (diffStyle) => {
    const previous = get().diffStyle;
    set({ diffStyle });
    await updateDiffSetting('diff_style', diffStyle, () => set({ diffStyle: previous }));
  },

  setShowBackgrounds: async (showBackgrounds) => {
    const previous = get().showBackgrounds;
    set({ showBackgrounds });
    await updateDiffSetting('show_backgrounds', showBackgrounds, () =>
      set({ showBackgrounds: previous }),
    );
  },

  setLineNumbers: async (lineNumbers) => {
    const previous = get().lineNumbers;
    set({ lineNumbers });
    await updateDiffSetting('line_numbers', lineNumbers, () =>
      set({ lineNumbers: previous }),
    );
  },

  setWordWrap: async (wordWrap) => {
    const previous = get().wordWrap;
    set({ wordWrap });
    await updateDiffSetting('word_wrap', wordWrap, () => set({ wordWrap: previous }));
  },

  setDiffIndicators: async (diffIndicators) => {
    const previous = get().diffIndicators;
    set({ diffIndicators });
    await updateDiffSetting('diff_indicators', diffIndicators, () =>
      set({ diffIndicators: previous }),
    );
  },
}));
