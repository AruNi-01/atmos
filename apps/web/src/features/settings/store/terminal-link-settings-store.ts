'use client';

import * as React from 'react';
import { create } from 'zustand';
import { toastManager } from '@workspace/ui';
import { useTranslations } from 'next-intl';

import { functionSettingsApi } from '@/api/ws-api';
import { useFunctionSettingsStore } from '@/features/settings/store/function-settings-store';
import {
  QUICK_OPEN_APP_NAMES,
  type QuickOpenAppName,
  isQuickOpenAppName,
} from '@/app-shell/quick-open-apps';

export type TerminalFileLinkOpenMode = 'atmos' | 'finder' | 'app';

interface TerminalLinkSettingsState {
  fileLinkOpenMode: TerminalFileLinkOpenMode;
  fileLinkOpenApp: QuickOpenAppName;
  loaded: boolean;
  loading: boolean;
  loadRequestToken: number;
  modeRequestToken: number;
  appRequestToken: number;
  loadSettings: () => Promise<void>;
  setFileLinkOpenMode: (mode: TerminalFileLinkOpenMode) => Promise<void>;
  setFileLinkOpenApp: (app: QuickOpenAppName) => Promise<void>;
}

const DEFAULT_FILE_LINK_OPEN_MODE: TerminalFileLinkOpenMode = 'atmos';
const DEFAULT_FILE_LINK_OPEN_APP: QuickOpenAppName = 'Cursor';

type TerminalLinkStoreTranslator = ReturnType<typeof useTranslations>;

let terminalLinkSettingsTranslator: TerminalLinkStoreTranslator | null = null;

function terminalLinkStoreText(
  key: 'syncFailedTitle' | 'openModeFailed' | 'openAppFailed',
): string {
  if (terminalLinkSettingsTranslator) {
    return terminalLinkSettingsTranslator(key);
  }

  switch (key) {
    case 'syncFailedTitle':
      return 'Settings Sync Failed';
    case 'openModeFailed':
      return 'Failed to update the terminal link open mode.';
    case 'openAppFailed':
      return 'Failed to update the terminal link app.';
  }
}

const terminalLinkSettingsStore = create<TerminalLinkSettingsState>((set, get) => ({
  fileLinkOpenMode: DEFAULT_FILE_LINK_OPEN_MODE,
  fileLinkOpenApp: DEFAULT_FILE_LINK_OPEN_APP,
  loaded: false,
  loading: false,
  loadRequestToken: 0,
  modeRequestToken: 0,
  appRequestToken: 0,

  loadSettings: async () => {
    if (get().loaded || get().loading) return;

    const loadRequestToken = get().loadRequestToken + 1;
    set({ loading: true, loadRequestToken });

    try {
      const settings = await useFunctionSettingsStore.getState().load();
      const current = get();
      if (current.loadRequestToken !== loadRequestToken) {
        return;
      }
      const nextMode = settings.terminal?.file_link_open_mode;
      const nextApp = settings.terminal?.file_link_open_app;

      set({
        fileLinkOpenMode:
          nextMode === 'finder' || nextMode === 'app' || nextMode === 'atmos'
            ? nextMode
            : DEFAULT_FILE_LINK_OPEN_MODE,
        fileLinkOpenApp: isQuickOpenAppName(nextApp)
          ? nextApp
          : DEFAULT_FILE_LINK_OPEN_APP,
        loaded: true,
        loading: false,
      });
    } catch {
      if (get().loadRequestToken === loadRequestToken) {
        set({ loaded: false, loading: false });
      }
    }
  },

  setFileLinkOpenMode: async (mode) => {
    const previous = get().fileLinkOpenMode;
    const requestToken = get().modeRequestToken + 1;
    const loadRequestToken = get().loadRequestToken + 1;
    set({
      fileLinkOpenMode: mode,
      loaded: true,
      loading: false,
      loadRequestToken,
      modeRequestToken: requestToken,
    });

    try {
      await functionSettingsApi.update('terminal', 'file_link_open_mode', mode);
    } catch {
      const current = get();
      if (current.modeRequestToken === requestToken && current.fileLinkOpenMode === mode) {
        set({ fileLinkOpenMode: previous });
      }
      toastManager.add({
        title: terminalLinkStoreText('syncFailedTitle'),
        description: terminalLinkStoreText('openModeFailed'),
        type: 'error',
      });
    }
  },

  setFileLinkOpenApp: async (app) => {
    const nextApp = isQuickOpenAppName(app) ? app : DEFAULT_FILE_LINK_OPEN_APP;
    const previous = get().fileLinkOpenApp;
    const requestToken = get().appRequestToken + 1;
    const loadRequestToken = get().loadRequestToken + 1;
    set({
      fileLinkOpenApp: nextApp,
      loaded: true,
      loading: false,
      loadRequestToken,
      appRequestToken: requestToken,
    });

    try {
      await functionSettingsApi.update('terminal', 'file_link_open_app', nextApp);
    } catch {
      const current = get();
      if (current.appRequestToken === requestToken && current.fileLinkOpenApp === nextApp) {
        set({ fileLinkOpenApp: previous });
      }
      toastManager.add({
        title: terminalLinkStoreText('syncFailedTitle'),
        description: terminalLinkStoreText('openAppFailed'),
        type: 'error',
      });
    }
  },
}));

export const useTerminalLinkSettingsStore = Object.assign(
  function useTerminalLinkSettingsStore(
    ...args: Parameters<typeof terminalLinkSettingsStore>
  ) {
    const t = useTranslations('settings.terminalLinkStore');

    React.useEffect(() => {
      terminalLinkSettingsTranslator = t;
      return () => {
        if (terminalLinkSettingsTranslator === t) {
          terminalLinkSettingsTranslator = null;
        }
      };
    }, [t]);

    return terminalLinkSettingsStore(...args);
  },
  terminalLinkSettingsStore,
);

export {
  DEFAULT_FILE_LINK_OPEN_APP,
  DEFAULT_FILE_LINK_OPEN_MODE,
  QUICK_OPEN_APP_NAMES,
};
