'use client';

import { create } from 'zustand';
import { toastManager } from '@workspace/ui';

import { functionSettingsApi } from '@/api/ws-api';
import {
  QUICK_OPEN_APP_NAMES,
  type QuickOpenAppName,
  isQuickOpenAppName,
} from '@/components/layout/quick-open-apps';

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

export const useTerminalLinkSettings = create<TerminalLinkSettingsState>((set, get) => ({
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
      const settings = await functionSettingsApi.get();
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
        title: 'Settings Sync Failed',
        description: 'Failed to update the terminal link open mode.',
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
        title: 'Settings Sync Failed',
        description: 'Failed to update the terminal link app.',
        type: 'error',
      });
    }
  },
}));

export {
  DEFAULT_FILE_LINK_OPEN_APP,
  DEFAULT_FILE_LINK_OPEN_MODE,
  QUICK_OPEN_APP_NAMES,
};
