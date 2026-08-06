'use client';

import * as React from 'react';
import { create } from 'zustand';
import { toastManager } from '@workspace/ui';
import { useTranslations } from 'next-intl';

import { functionSettingsApi } from '@/api/ws-api';
import { getComputerQueryScope } from '@/api/query/query-scope';
import { useFunctionSettingsStore } from '@/features/settings/store/function-settings-store';

/** xterm.js cursorStyle presets. */
export type TerminalCursorStyle = 'block' | 'underline' | 'bar';

export const TERMINAL_CURSOR_STYLES = ['block', 'underline', 'bar'] as const satisfies readonly TerminalCursorStyle[];

/** Match historical defaultTerminalOptions (underline + blink). */
export const DEFAULT_TERMINAL_CURSOR_STYLE: TerminalCursorStyle = 'underline';
export const DEFAULT_TERMINAL_CURSOR_BLINK = true;

interface TerminalAppearanceSettingsState {
  cursorStyle: TerminalCursorStyle;
  cursorBlink: boolean;
  loaded: boolean;
  loading: boolean;
  loadSettings: () => Promise<void>;
  /** Drop cached prefs when the active Computer changes. */
  resetForConnectionChange: () => void;
  setCursorStyle: (style: TerminalCursorStyle) => Promise<void>;
  setCursorBlink: (blink: boolean) => Promise<void>;
}

type TerminalAppearanceSettingsStoreTranslator = ReturnType<typeof useTranslations>;

let terminalAppearanceSettingsTranslator: TerminalAppearanceSettingsStoreTranslator | null = null;
let styleRequestToken = 0;
let blinkRequestToken = 0;
let loadRequestToken = 0;
let lastPersistedCursorStyle: TerminalCursorStyle = DEFAULT_TERMINAL_CURSOR_STYLE;
let lastPersistedCursorBlink: boolean = DEFAULT_TERMINAL_CURSOR_BLINK;
let hydratedStyleFromServer = false;
let hydratedBlinkFromServer = false;

export function parseTerminalCursorStyle(value: unknown): TerminalCursorStyle {
  return value === 'block' || value === 'underline' || value === 'bar'
    ? value
    : DEFAULT_TERMINAL_CURSOR_STYLE;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function terminalAppearanceSettingsText(
  key: 'syncFailedTitle' | 'cursorStyleFailed' | 'cursorBlinkFailed',
): string {
  if (terminalAppearanceSettingsTranslator) {
    return terminalAppearanceSettingsTranslator(key);
  }

  switch (key) {
    case 'syncFailedTitle':
      return 'Settings Sync Failed';
    case 'cursorStyleFailed':
      return 'Failed to update the terminal cursor style.';
    case 'cursorBlinkFailed':
      return 'Failed to update terminal cursor blink.';
  }
}

async function hydratePersistedFromServer(): Promise<void> {
  const settings = await useFunctionSettingsStore.getState().load();
  lastPersistedCursorStyle = parseTerminalCursorStyle(settings.terminal?.cursor_style);
  lastPersistedCursorBlink = asBoolean(
    settings.terminal?.cursor_blink,
    DEFAULT_TERMINAL_CURSOR_BLINK,
  );
  hydratedStyleFromServer = true;
  hydratedBlinkFromServer = true;
}

const terminalAppearanceSettingsStore = create<TerminalAppearanceSettingsState>((set, get) => ({
  cursorStyle: DEFAULT_TERMINAL_CURSOR_STYLE,
  cursorBlink: DEFAULT_TERMINAL_CURSOR_BLINK,
  loaded: false,
  loading: false,

  resetForConnectionChange: () => {
    loadRequestToken += 1;
    styleRequestToken += 1;
    blinkRequestToken += 1;
    lastPersistedCursorStyle = DEFAULT_TERMINAL_CURSOR_STYLE;
    lastPersistedCursorBlink = DEFAULT_TERMINAL_CURSOR_BLINK;
    hydratedStyleFromServer = false;
    hydratedBlinkFromServer = false;
    set({
      cursorStyle: DEFAULT_TERMINAL_CURSOR_STYLE,
      cursorBlink: DEFAULT_TERMINAL_CURSOR_BLINK,
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
      // Do not clobber optimistic toggles that finished while load was in flight.
      if (get().loaded) {
        set({ loading: false });
        return;
      }
      set({
        cursorStyle: lastPersistedCursorStyle,
        cursorBlink: lastPersistedCursorBlink,
        loaded: true,
        loading: false,
      });
    } catch {
      if (loadRequestToken === requestToken) {
        set({
          cursorStyle: DEFAULT_TERMINAL_CURSOR_STYLE,
          cursorBlink: DEFAULT_TERMINAL_CURSOR_BLINK,
          loaded: true,
          loading: false,
        });
      }
    }
  },

  setCursorStyle: async (style) => {
    const next = parseTerminalCursorStyle(style);
    const requestToken = ++styleRequestToken;
    const expectedScope = getComputerQueryScope();
    set({
      cursorStyle: next,
      loaded: true,
      loading: false,
    });

    try {
      await functionSettingsApi.update('terminal', 'cursor_style', next, expectedScope);
      lastPersistedCursorStyle = next;
    } catch {
      if (styleRequestToken === requestToken) {
        if (!hydratedStyleFromServer) {
          try {
            await hydratePersistedFromServer();
          } catch {
            /* keep last known */
          }
        }
        set({ cursorStyle: lastPersistedCursorStyle });
      }
      toastManager.add({
        title: terminalAppearanceSettingsText('syncFailedTitle'),
        description: terminalAppearanceSettingsText('cursorStyleFailed'),
        type: 'error',
      });
    }
  },

  setCursorBlink: async (blink) => {
    const requestToken = ++blinkRequestToken;
    const expectedScope = getComputerQueryScope();
    set({
      cursorBlink: blink,
      loaded: true,
      loading: false,
    });

    try {
      await functionSettingsApi.update('terminal', 'cursor_blink', blink, expectedScope);
      lastPersistedCursorBlink = blink;
    } catch {
      if (blinkRequestToken === requestToken) {
        if (!hydratedBlinkFromServer) {
          try {
            await hydratePersistedFromServer();
          } catch {
            /* keep last known */
          }
        }
        set({ cursorBlink: lastPersistedCursorBlink });
      }
      toastManager.add({
        title: terminalAppearanceSettingsText('syncFailedTitle'),
        description: terminalAppearanceSettingsText('cursorBlinkFailed'),
        type: 'error',
      });
    }
  },
}));

function useTerminalAppearanceSettingsStoreHook(): TerminalAppearanceSettingsState;
function useTerminalAppearanceSettingsStoreHook<T>(
  selector: (state: TerminalAppearanceSettingsState) => T,
): T;
function useTerminalAppearanceSettingsStoreHook<T>(
  selector?: (state: TerminalAppearanceSettingsState) => T,
): T | TerminalAppearanceSettingsState {
  const t = useTranslations('settings.terminalAppearanceSettingsStore');

  React.useEffect(() => {
    terminalAppearanceSettingsTranslator = t;
  }, [t]);

  if (selector) {
    return terminalAppearanceSettingsStore(selector);
  }
  return terminalAppearanceSettingsStore();
}

export const useTerminalAppearanceSettingsStore = Object.assign(
  useTerminalAppearanceSettingsStoreHook,
  terminalAppearanceSettingsStore,
);
