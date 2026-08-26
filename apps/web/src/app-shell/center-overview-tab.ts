"use client";

import { create } from "zustand";
import {
  hydrateCenterLayoutCache,
  markCenterLayoutDirty,
} from "@/app-shell/center-layout/center-layout-persist";

type OverviewCenterTabStore = {
  visibleByContext: Record<string, boolean>;
  hydrated: boolean;
  hydrate: () => void;
  open: (contextId: string) => void;
  close: (contextId: string) => void;
  isOpen: (contextId: string) => boolean;
};

export const useOverviewCenterTabStore = create<OverviewCenterTabStore>((set, get) => ({
  visibleByContext: {},
  hydrated: false,

  hydrate: () => {
    if (get().hydrated) return;
    hydrateCenterLayoutCache();
  },

  open: (contextId) => {
    if (!contextId) return;
    if (get().visibleByContext[contextId]) return;
    set((state) => ({
      visibleByContext: { ...state.visibleByContext, [contextId]: true },
    }));
    markCenterLayoutDirty();
  },
  close: (contextId) => {
    if (!contextId) return;
    if (!get().visibleByContext[contextId]) return;
    set((state) => ({
      visibleByContext: { ...state.visibleByContext, [contextId]: false },
    }));
    markCenterLayoutDirty();
  },
  isOpen: (contextId) => Boolean(get().visibleByContext[contextId]),
}));
