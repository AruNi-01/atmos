"use client";

import { create } from "zustand";
import { readJson, writeJson } from "@/shared/lib/browser-store";

const STORAGE_KEY = "atmos.center-overview-tab.v1";

type OverviewCenterTabStore = {
  visibleByContext: Record<string, boolean>;
  hydrated: boolean;
  hydrate: () => void;
  open: (contextId: string) => void;
  close: (contextId: string) => void;
  isOpen: (contextId: string) => boolean;
};

function persist(visibleByContext: Record<string, boolean>) {
  const pruned: Record<string, boolean> = {};
  for (const [contextId, open] of Object.entries(visibleByContext)) {
    if (open) pruned[contextId] = true;
  }
  writeJson(STORAGE_KEY, pruned);
}

function readStored(): Record<string, boolean> {
  const raw = readJson<Record<string, boolean> | null>(STORAGE_KEY, null);
  if (!raw || typeof raw !== "object") return {};
  const next: Record<string, boolean> = {};
  for (const [contextId, open] of Object.entries(raw)) {
    if (open) next[contextId] = true;
  }
  return next;
}

export const useOverviewCenterTabStore = create<OverviewCenterTabStore>((set, get) => ({
  visibleByContext: {},
  hydrated: false,

  hydrate: () => {
    if (get().hydrated) return;
    set({ visibleByContext: readStored(), hydrated: true });
  },

  open: (contextId) => {
    if (!contextId) return;
    set((state) => {
      if (state.visibleByContext[contextId]) return state;
      const visibleByContext = { ...state.visibleByContext, [contextId]: true };
      persist(visibleByContext);
      return { visibleByContext };
    });
  },
  close: (contextId) => {
    if (!contextId) return;
    set((state) => {
      if (!state.visibleByContext[contextId]) return state;
      const visibleByContext = { ...state.visibleByContext, [contextId]: false };
      persist(visibleByContext);
      return { visibleByContext };
    });
  },
  isOpen: (contextId) => Boolean(get().visibleByContext[contextId]),
}));
