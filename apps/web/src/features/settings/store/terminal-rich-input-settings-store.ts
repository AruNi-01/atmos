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
/** True once we have applied values from the server at least once. */
let hydratedFromServer = false;
/**
 * Serialize terminal function_settings writes: the server does whole-file RMW,
 * so concurrent updates for two keys can clobber each other.
 */
let terminalSettingsWriteChain: Promise<void> = Promise.resolve();

function enqueueTerminalSettingsWrite(task: () => Promise<void>): Promise<void> {
  const run = terminalSettingsWriteChain.then(task, task);
  terminalSettingsWriteChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

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

async function hydratePersistedFromServer(): Promise<void> {
  const settings = await useFunctionSettingsStore.getState().load();
  lastPersistedEnabled = asBoolean(
    settings.terminal?.rich_input_enabled,
    DEFAULT_TERMINAL_RICH_INPUT_ENABLED,
  );
  lastPersistedTriggerBarVisible = asBoolean(
    settings.terminal?.rich_input_trigger_bar_visible,
    DEFAULT_TERMINAL_RICH_INPUT_TRIGGER_BAR_VISIBLE,
  );
  hydratedFromServer = true;
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
      await hydratePersistedFromServer();
      // A setter may have marked loaded while this request was in flight —
      // do not clobber the user's optimistic toggle with a stale load result.
      // Still keep lastPersisted* in sync for correct rollback.
      if (get().loaded) {
        set({ loading: false });
        return;
      }
      set({
        enabled: lastPersistedEnabled,
        triggerBarVisible: lastPersistedTriggerBarVisible,
        loaded: true,
        loading: false,
      });
    } catch {
      if (!get().loaded) {
        set({ loaded: false, loading: false });
      } else {
        set({ loading: false });
      }
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
      await enqueueTerminalSettingsWrite(async () => {
        await functionSettingsApi.update('terminal', 'rich_input_enabled', enabled);
      });
      if (enabledRequestToken === requestToken) {
        lastPersistedEnabled = enabled;
        hydratedFromServer = true;
      }
    } catch {
      if (enabledRequestToken === requestToken) {
        if (!hydratedFromServer) {
          try {
            await hydratePersistedFromServer();
          } catch {
            /* keep last known defaults */
          }
        }
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
      await enqueueTerminalSettingsWrite(async () => {
        await functionSettingsApi.update(
          'terminal',
          'rich_input_trigger_bar_visible',
          visible,
        );
      });
      if (triggerBarRequestToken === requestToken) {
        lastPersistedTriggerBarVisible = visible;
        hydratedFromServer = true;
      }
    } catch {
      if (triggerBarRequestToken === requestToken) {
        if (!hydratedFromServer) {
          try {
            await hydratePersistedFromServer();
          } catch {
            /* keep last known defaults */
          }
        }
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
