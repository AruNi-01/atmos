"use client";

import { create } from "zustand";
import {
  hydrateCenterLayoutCache,
  markCenterLayoutDirty,
  syncCenterLayoutFromDisk,
} from "@/app-shell/center-layout/center-layout-persist";
import {
  createSavedLayoutId,
  MAX_SAVED_CENTER_LAYOUTS,
  type SavedCenterLayout,
} from "@/app-shell/center-pane/center-pane-saved-layout";

type CenterPaneSavedLayoutStore = {
  layouts: SavedCenterLayout[];
  hydrated: boolean;
  /** True after a disk sync attempt finished (success or soft-fail). */
  diskSynced: boolean;
  hydrate: () => void;
  syncFromDisk: () => Promise<void>;
  list: () => SavedCenterLayout[];
  getById: (id: string) => SavedCenterLayout | null;
  save: (layout: SavedCenterLayout) => SavedCenterLayout;
  rename: (id: string, name: string) => void;
  remove: (id: string) => void;
};

function commitLayouts(
  set: (partial: Partial<CenterPaneSavedLayoutStore>) => void,
  layouts: SavedCenterLayout[],
) {
  const next = layouts.slice(0, MAX_SAVED_CENTER_LAYOUTS);
  set({ layouts: next, hydrated: true });
  markCenterLayoutDirty();
}

export const useCenterPaneSavedLayoutStore = create<CenterPaneSavedLayoutStore>(
  (set, get) => ({
    layouts: [],
    hydrated: false,
    diskSynced: false,

    hydrate: () => {
      if (get().hydrated) return;
      hydrateCenterLayoutCache();
    },

    syncFromDisk: () => syncCenterLayoutFromDisk(),

    list: () => {
      if (!get().hydrated) get().hydrate();
      return get().layouts;
    },

    getById: (id) => {
      if (!get().hydrated) get().hydrate();
      return get().layouts.find((item) => item.id === id) ?? null;
    },

    save: (layout) => {
      if (!get().hydrated) get().hydrate();
      const now = Date.now();
      const nextItem: SavedCenterLayout = {
        ...layout,
        id: layout.id || createSavedLayoutId(),
        name: layout.name.trim() || "Layout",
        updatedAt: now,
        createdAt: layout.createdAt || now,
      };
      const without = get().layouts.filter((item) => item.id !== nextItem.id);
      const layouts = [nextItem, ...without].slice(0, MAX_SAVED_CENTER_LAYOUTS);
      commitLayouts(set, layouts);
      return nextItem;
    },

    rename: (id, name) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      const layouts = get().layouts.map((item) =>
        item.id === id
          ? { ...item, name: trimmed, updatedAt: Date.now() }
          : item,
      );
      commitLayouts(set, layouts);
    },

    remove: (id) => {
      const layouts = get().layouts.filter((item) => item.id !== id);
      commitLayouts(set, layouts);
    },
  }),
);
