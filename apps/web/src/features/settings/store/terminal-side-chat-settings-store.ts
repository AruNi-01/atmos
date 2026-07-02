'use client';

import * as React from 'react';
import { create } from 'zustand';
import { toastManager } from '@workspace/ui';
import { useTranslations } from 'next-intl';

import { functionSettingsApi } from '@/api/ws-api';
import { useFunctionSettingsStore } from '@/features/settings/store/function-settings-store';

export const DEFAULT_TERMINAL_SIDE_CONTEXT_PROMPT_BUDGET_BYTES = 98_304;
export const MIN_TERMINAL_SIDE_CONTEXT_PROMPT_BUDGET_BYTES = 8_192;
export const MAX_TERMINAL_SIDE_CONTEXT_PROMPT_BUDGET_BYTES = 131_072;
export const TERMINAL_SIDE_CONTEXT_PROMPT_BUDGET_STEP_BYTES = 8_192;

interface TerminalSideChatSettingsState {
  sideContextPromptBudgetBytes: number;
  loaded: boolean;
  loading: boolean;
  loadSettings: () => Promise<void>;
  setSideContextPromptBudgetBytes: (bytes: number) => Promise<void>;
}

type TerminalSideChatSettingsStoreTranslator = ReturnType<typeof useTranslations>;

let terminalSideChatSettingsTranslator: TerminalSideChatSettingsStoreTranslator | null = null;
let sideContextPromptBudgetRequestToken = 0;
let lastPersistedSideContextPromptBudgetBytes =
  DEFAULT_TERMINAL_SIDE_CONTEXT_PROMPT_BUDGET_BYTES;

export function normalizeTerminalSideContextPromptBudgetBytes(
  value: number | null | undefined,
): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_TERMINAL_SIDE_CONTEXT_PROMPT_BUDGET_BYTES;
  }

  return Math.min(
    MAX_TERMINAL_SIDE_CONTEXT_PROMPT_BUDGET_BYTES,
    Math.max(MIN_TERMINAL_SIDE_CONTEXT_PROMPT_BUDGET_BYTES, Math.trunc(value)),
  );
}

function terminalSideChatSettingsText(
  key: 'syncFailedTitle' | 'budgetFailed',
): string {
  if (terminalSideChatSettingsTranslator) {
    return terminalSideChatSettingsTranslator(key);
  }

  switch (key) {
    case 'syncFailedTitle':
      return 'Settings Sync Failed';
    case 'budgetFailed':
      return 'Failed to update the side chat context budget.';
  }
}

const terminalSideChatSettingsStore = create<TerminalSideChatSettingsState>((set, get) => ({
  sideContextPromptBudgetBytes: DEFAULT_TERMINAL_SIDE_CONTEXT_PROMPT_BUDGET_BYTES,
  loaded: false,
  loading: false,

  loadSettings: async () => {
    if (get().loaded || get().loading) return;

    set({ loading: true });

    try {
      const settings = await useFunctionSettingsStore.getState().load();
      const sideContextPromptBudgetBytes = normalizeTerminalSideContextPromptBudgetBytes(
        settings.terminal?.side_context_prompt_budget_bytes,
      );
      lastPersistedSideContextPromptBudgetBytes = sideContextPromptBudgetBytes;
      set({
        sideContextPromptBudgetBytes,
        loaded: true,
        loading: false,
      });
    } catch {
      set({ loaded: false, loading: false });
    }
  },

  setSideContextPromptBudgetBytes: async (bytes) => {
    const normalized = normalizeTerminalSideContextPromptBudgetBytes(bytes);
    const requestToken = ++sideContextPromptBudgetRequestToken;
    set({
      sideContextPromptBudgetBytes: normalized,
      loaded: true,
      loading: false,
    });

    try {
      await functionSettingsApi.update(
        'terminal',
        'side_context_prompt_budget_bytes',
        normalized,
      );
      if (sideContextPromptBudgetRequestToken === requestToken) {
        lastPersistedSideContextPromptBudgetBytes = normalized;
      }
    } catch {
      if (sideContextPromptBudgetRequestToken === requestToken) {
        set({ sideContextPromptBudgetBytes: lastPersistedSideContextPromptBudgetBytes });
      }
      toastManager.add({
        title: terminalSideChatSettingsText('syncFailedTitle'),
        description: terminalSideChatSettingsText('budgetFailed'),
        type: 'error',
      });
    }
  },
}));

export const useTerminalSideChatSettingsStore = Object.assign(
  function useTerminalSideChatSettingsStore(
    ...args: Parameters<typeof terminalSideChatSettingsStore>
  ) {
    const t = useTranslations('settings.terminalSideChatSettingsStore');

    React.useEffect(() => {
      terminalSideChatSettingsTranslator = t;
      return () => {
        if (terminalSideChatSettingsTranslator === t) {
          terminalSideChatSettingsTranslator = null;
        }
      };
    }, [t]);

    return terminalSideChatSettingsStore(...args);
  },
  terminalSideChatSettingsStore,
);
