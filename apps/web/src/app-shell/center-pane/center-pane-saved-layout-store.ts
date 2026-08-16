"use client";

import { create } from "zustand";
import { globalKey, readJson, writeJson } from "@/shared/lib/browser-store";
import { functionSettingsApi } from "@/api/ws/settings-api";
import {
  createSavedLayoutId,
  MAX_SAVED_CENTER_LAYOUTS,
  normalizeSavedCenterLayouts,
  type SavedCenterLayout,
} from "@/app-shell/center-pane/center-pane-saved-layout";

/**
 * Fast frontend cache. Durable copy lives in
 * `~/.atmos/config/function_settings.json` → `center_stage.saved_layouts`
 * (via function_settings_update).
 */
const STORAGE_KEY = globalKey("center-saved-layouts");

type CenterPaneSavedLayoutStore = {
  layouts: SavedCenterLayout[];
  hydrated: boolean;
  /** True after a disk sync attempt finished (success or soft-fail). */
  diskSynced: boolean;
  /** Sync localStorage cache into memory (instant). */
  hydrate: () => void;
  /**
   * When the local cache is empty, load from ~/.atmos via function settings.
   * When the cache has data but disk does not, push the cache to disk (migrate).
   */
  syncFromDisk: () => Promise<void>;
  list: () => SavedCenterLayout[];
  getById: (id: string) => SavedCenterLayout | null;
  save: (layout: SavedCenterLayout) => SavedCenterLayout;
  rename: (id: string, name: string) => void;
  remove: (id: string) => void;
};

function persistLocal(layouts: SavedCenterLayout[]) {
  writeJson(STORAGE_KEY, layouts);
}

function readLocal(): SavedCenterLayout[] {
  return normalizeSavedCenterLayouts(
    readJson<SavedCenterLayout[] | null>(STORAGE_KEY, null),
  );
}

async function persistDisk(layouts: SavedCenterLayout[]): Promise<void> {
  await functionSettingsApi.update("center_stage", "saved_layouts", layouts);
}

async function readDiskLayouts(): Promise<SavedCenterLayout[]> {
  const settings = await functionSettingsApi.get();
  const centerStage = settings.center_stage as
    | { saved_layouts?: unknown }
    | undefined;
  return normalizeSavedCenterLayouts(centerStage?.saved_layouts);
}

function commitLayouts(
  set: (partial: Partial<CenterPaneSavedLayoutStore>) => void,
  layouts: SavedCenterLayout[],
) {
  const next = layouts.slice(0, MAX_SAVED_CENTER_LAYOUTS);
  persistLocal(next);
  set({ layouts: next, hydrated: true });
  void persistDisk(next).catch(() => {
    // Offline / WS not ready: local cache still holds the latest edit.
  });
}

export const useCenterPaneSavedLayoutStore = create<CenterPaneSavedLayoutStore>(
  (set, get) => ({
    layouts: [],
    hydrated: false,
    diskSynced: false,

    hydrate: () => {
      if (get().hydrated) return;
      set({ layouts: readLocal(), hydrated: true });
    },

    syncFromDisk: async () => {
      if (!get().hydrated) get().hydrate();
      try {
        const disk = await readDiskLayouts();
        const local = get().layouts;

        if (local.length === 0 && disk.length > 0) {
          // Cache miss → durable file is source of truth.
          persistLocal(disk);
          set({ layouts: disk, diskSynced: true });
          return;
        }

        if (local.length > 0 && disk.length === 0) {
          // First-time migrate local-only cache onto ~/.atmos.
          await persistDisk(local);
          set({ diskSynced: true });
          return;
        }

        set({ diskSynced: true });
      } catch {
        // Server/settings unavailable — keep local cache only.
        set({ diskSynced: true });
      }
    },

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
