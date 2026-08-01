'use client';

import * as React from 'react';
import { create } from 'zustand';
import { toastManager } from '@workspace/ui';
import { useTranslations } from 'next-intl';

import { functionSettingsApi } from '@/api/ws-api';
import { useFunctionSettingsStore } from '@/features/settings/store/function-settings-store';

export const DEFAULT_TERMINAL_RICH_INPUT_ENABLED = true;
export const DEFAULT_TERMINAL_RICH_INPUT_TRIGGER_BAR_VISIBLE = true;

interface TerminalRichInputSettingsState {
  enabled: boolean;
  triggerBarVisible: boolean;
  loaded: boolean;
  loading: boolean;
  loadSettings: () => Promise<void>;
  setEnabled: (enabled: boolean) => Promise<void>;
  setTriggerBarVisible: (visible: boolean) => Promise<void>;
}

type TerminalRichInputSettingsStoreTranslator = ReturnType<typeof useTranslations>;

let terminalRichInputSettingsTranslator: TerminalRichInputSettingsStoreTranslator | null = null;
let enabledRequestToken = 0;
let triggerBarRequestToken = 0;
let lastPersistedEnabled = DEFAULT_TERMINAL_RICH_INPUT_ENABLED;
let lastPersistedTriggerBarVisible = DEFAULT_TERMINAL_RICH_INPUT_TRIGGER_BAR_VISIBLE;

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function terminalRichInputSettingsText(
  key: 'syncFailedTitle' | 'enabledFailed' | 'triggerBarFailed',
): string {
  if (terminalRichInputSettingsTranslator) {
    return terminalRichInputSettingsTranslator(key);
  }

  switch (key) {
    case 'syncFailedTitle':
      return 'Settings Sync Failed';
    case 'enabledFailed':
      return 'Failed to update Terminal Rich Input.';
    case 'triggerBarFailed':
      return 'Failed to update the Rich Input trigger bar.';
  }
}

const terminalRichInputSettingsStore = create<TerminalRichInputSettingsState>((set, get) => ({
  enabled: DEFAULT_TERMINAL_RICH_INPUT_ENABLED,
  triggerBarVisible: DEFAULT_TERMINAL_RICH_INPUT_TRIGGER_BAR_VISIBLE,
  loaded: false,
  loading: false,

  loadSettings: async () => {
    if (get().loaded || get().loading) return;

    set({ loading: true });

    try {
      const settings = await useFunctionSettingsStore.getState().load();
      const enabled = asBoolean(
        settings.terminal?.rich_input_enabled,
        DEFAULT_TERMINAL_RICH_INPUT_ENABLED,
      );
      const triggerBarVisible = asBoolean(
        settings.terminal?.rich_input_trigger_bar_visible,
        DEFAULT_TERMINAL_RICH_INPUT_TRIGGER_BAR_VISIBLE,
      );
      lastPersistedEnabled = enabled;
      lastPersistedTriggerBarVisible = triggerBarVisible;
      set({
        enabled,
        triggerBarVisible,
        loaded: true,
        loading: false,
      });
    } catch {
      set({ loaded: false, loading: false });
    }
  },

  setEnabled: async (enabled) => {
    const requestToken = ++enabledRequestToken;
    set({
      enabled,
      loaded: true,
      loading: false,
    });

    try {
      await functionSettingsApi.update('terminal', 'rich_input_enabled', enabled);
      if (enabledRequestToken === requestToken) {
        lastPersistedEnabled = enabled;
      }
    } catch {
      if (enabledRequestToken === requestToken) {
        set({ enabled: lastPersistedEnabled });
      }
      toastManager.add({
        title: terminalRichInputSettingsText('syncFailedTitle'),
        description: terminalRichInputSettingsText('enabledFailed'),
        type: 'error',
      });
    }
  },

  setTriggerBarVisible: async (visible) => {
    const requestToken = ++triggerBarRequestToken;
    set({
      triggerBarVisible: visible,
      loaded: true,
      loading: false,
    });

    try {
      await functionSettingsApi.update('terminal', 'rich_input_trigger_bar_visible', visible);
      if (triggerBarRequestToken === requestToken) {
        lastPersistedTriggerBarVisible = visible;
      }
    } catch {
      if (triggerBarRequestToken === requestToken) {
        set({ triggerBarVisible: lastPersistedTriggerBarVisible });
      }
      toastManager.add({
        title: terminalRichInputSettingsText('syncFailedTitle'),
        description: terminalRichInputSettingsText('triggerBarFailed'),
        type: 'error',
      });
    }
  },
}));

export const useTerminalRichInputSettingsStore = Object.assign(
  function useTerminalRichInputSettingsStore(
    ...args: Parameters<typeof terminalRichInputSettingsStore>
  ) {
    const t = useTranslations('settings.terminalRichInputSettingsStore');

    React.useEffect(() => {
      terminalRichInputSettingsTranslator = t;
      return () => {
        if (terminalRichInputSettingsTranslator === t) {
          terminalRichInputSettingsTranslator = null;
        }
      };
    }, [t]);

    return terminalRichInputSettingsStore(...args);
  },
  terminalRichInputSettingsStore,
);
