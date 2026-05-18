'use client';

import { create } from 'zustand';

import {
  DEFAULT_TERMINAL_SPLIT_PREFS,
  patchTerminalSplitPrefs,
  readTerminalSplitPrefs,
  rememberLastSplitAgentId,
  type TerminalSplitPrefs,
} from '@/lib/terminal-split-prefs';

interface TerminalSplitPrefsState extends TerminalSplitPrefs {
  hydrated: boolean;
  hydrate: () => void;
  setUseLastSplitAgentOnSplit: (enabled: boolean) => void;
  rememberLastSplitAgent: (agentId: string) => void;
}

export const useTerminalSplitPrefs = create<TerminalSplitPrefsState>((set, get) => ({
  ...DEFAULT_TERMINAL_SPLIT_PREFS,
  hydrated: false,

  hydrate: () => {
    if (get().hydrated) return;
    set({ ...readTerminalSplitPrefs(), hydrated: true });
  },

  setUseLastSplitAgentOnSplit: (enabled) => {
    const next = patchTerminalSplitPrefs({ useLastSplitAgentOnSplit: enabled });
    set({ ...next, hydrated: true });
  },

  rememberLastSplitAgent: (agentId) => {
    const next = rememberLastSplitAgentId(agentId);
    set({ ...next, hydrated: true });
  },
}));
