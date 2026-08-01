'use client';

import * as React from 'react';
import { create } from 'zustand';
import { toastManager } from '@workspace/ui';
import { useTranslations } from 'next-intl';

import { functionSettingsApi } from '@/api/ws-api';
import { getComputerQueryScope } from '@/api/query/query-scope';
import { useFunctionSettingsStore } from '@/features/settings/store/function-settings-store';

export const DEFAULT_TERMINAL_RICH_INPUT_ENABLED = true;
export const DEFAULT_TERMINAL_RICH_INPUT_TRIGGER_BAR_VISIBLE = true;

interface TerminalRichInputSettingsState {
  enabled: boolean;
  triggerBarVisible: boolean;
  loaded: boolean;
  loading: boolean;
  loadSettings: () => Promise<void>;
  /** Drop cached prefs when the active Computer changes so the next load is fresh. */
  resetForConnectionChange: () => void;
  setEnabled: (enabled: boolean) => Promise<void>;
  setTriggerBarVisible: (visible: boolean) => Promise<void>;
}

type TerminalRichInputSettingsStoreTranslator = ReturnType<typeof useTranslations>;

/** Last non-null translator wins; do not clear to null on unmount (multi-consumer). */
let terminalRichInputSettingsTranslator: TerminalRichInputSettingsStoreTranslator | null = null;
let enabledRequestToken = 0;
let triggerBarRequestToken = 0;
let loadRequestToken = 0;
let lastPersistedEnabled = DEFAULT_TERMINAL_RICH_INPUT_ENABLED;
let lastPersistedTriggerBarVisible = DEFAULT_TERMINAL_RICH_INPUT_TRIGGER_BAR_VISIBLE;
/** True only after a full server hydrate of both fields. */
let hydratedEnabledFromServer = false;
let hydratedTriggerBarFromServer = false;

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
  hydratedEnabledFromServer = true;
  hydratedTriggerBarFromServer = true;
}

const terminalRichInputSettingsStore = create<TerminalRichInputSettingsState>((set, get) => ({
  enabled: DEFAULT_TERMINAL_RICH_INPUT_ENABLED,
  triggerBarVisible: DEFAULT_TERMINAL_RICH_INPUT_TRIGGER_BAR_VISIBLE,
  loaded: false,
  loading: false,

  resetForConnectionChange: () => {
    loadRequestToken += 1;
    enabledRequestToken += 1;
    triggerBarRequestToken += 1;
    lastPersistedEnabled = DEFAULT_TERMINAL_RICH_INPUT_ENABLED;
    lastPersistedTriggerBarVisible = DEFAULT_TERMINAL_RICH_INPUT_TRIGGER_BAR_VISIBLE;
    hydratedEnabledFromServer = false;
    hydratedTriggerBarFromServer = false;
    set({
      enabled: DEFAULT_TERMINAL_RICH_INPUT_ENABLED,
      triggerBarVisible: DEFAULT_TERMINAL_RICH_INPUT_TRIGGER_BAR_VISIBLE,
      loaded: false,
      loading: false,
    });
  },

  loadSettings: async () => {
    if (get().loaded || get().loading) return;

    const requestToken = ++loadRequestToken;
    set({ loading: true });

    try {
      await hydratePersistedFromServer();
      if (loadRequestToken !== requestToken) {
        return;
      }
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
      if (loadRequestToken === requestToken) {
        // Fail open to defaults so the default-on composer is not stuck disabled.
        set({
          enabled: DEFAULT_TERMINAL_RICH_INPUT_ENABLED,
          triggerBarVisible: DEFAULT_TERMINAL_RICH_INPUT_TRIGGER_BAR_VISIBLE,
          loaded: true,
          loading: false,
        });
      }
    }
  },

  setEnabled: async (enabled) => {
    const requestToken = ++enabledRequestToken;
    const expectedScope = getComputerQueryScope();
    set({
      enabled,
      loaded: true,
      loading: false,
    });

    try {
      await functionSettingsApi.update(
        'terminal',
        'rich_input_enabled',
        enabled,
        expectedScope,
      );
      // Always advance the rollback snapshot for a successful write so a later
      // failed toggle does not roll back past a value that did persist.
      lastPersistedEnabled = enabled;
      if (enabledRequestToken === requestToken) {
        // no-op: UI already shows `enabled`
      }
    } catch {
      if (enabledRequestToken === requestToken) {
        if (!hydratedEnabledFromServer) {
          try {
            await hydratePersistedFromServer();
          } catch {
            /* keep last known */
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
    const expectedScope = getComputerQueryScope();
    set({
      triggerBarVisible: visible,
      loaded: true,
      loading: false,
    });

    try {
      await functionSettingsApi.update(
        'terminal',
        'rich_input_trigger_bar_visible',
        visible,
        expectedScope,
      );
      lastPersistedTriggerBarVisible = visible;
      if (triggerBarRequestToken === requestToken) {
        // no-op: UI already shows `visible`
      }
    } catch {
      if (triggerBarRequestToken === requestToken) {
        if (!hydratedTriggerBarFromServer) {
          try {
            await hydratePersistedFromServer();
          } catch {
            /* keep last known */
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
      // Keep the newest translator; never null out on unmount so long-lived
      // terminal consumers still get localized setter toasts after Settings closes.
      terminalRichInputSettingsTranslator = t;
    }, [t]);

    return terminalRichInputSettingsStore(...args);
  },
  terminalRichInputSettingsStore,
);
