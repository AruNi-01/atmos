"use client";

import { create } from "zustand";
import { GIT_HISTORY_TAB_VALUE } from "../types";

type GitHistoryCenterTabStore = {
  visibleByContext: Record<string, boolean>;
  selectedCommitByContext: Record<string, string | null>;
  open: (contextId: string) => void;
  close: (contextId: string) => void;
  isOpen: (contextId: string) => boolean;
  selectCommit: (contextId: string, hash: string | null) => void;
};

export const useGitHistoryCenterTabStore = create<GitHistoryCenterTabStore>(
  (set, get) => ({
    visibleByContext: {},
    selectedCommitByContext: {},
    open: (contextId) => {
      if (!contextId) return;
      set((state) => {
        if (state.visibleByContext[contextId]) return state;
        return {
          visibleByContext: { ...state.visibleByContext, [contextId]: true },
        };
      });
    },
    close: (contextId) => {
      if (!contextId) return;
      set((state) => ({
        visibleByContext: { ...state.visibleByContext, [contextId]: false },
      }));
    },
    isOpen: (contextId) => Boolean(get().visibleByContext[contextId]),
    selectCommit: (contextId, hash) => {
      if (!contextId) return;
      set((state) => {
        if ((state.selectedCommitByContext[contextId] ?? null) === hash) {
          return state;
        }
        return {
          selectedCommitByContext: {
            ...state.selectedCommitByContext,
            [contextId]: hash,
          },
        };
      });
    },
  }),
);

export function isGitHistoryTabValue(value: string | null | undefined): boolean {
  return value === GIT_HISTORY_TAB_VALUE;
}
