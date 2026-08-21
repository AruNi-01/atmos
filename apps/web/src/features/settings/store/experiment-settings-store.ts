'use client';

import { create } from 'zustand';
import { functionSettingsApi } from '@/api/ws/settings-api';
import { useFunctionSettingsStore } from '@/features/settings/store/function-settings-store';
import { globalKey, readJson, removeKey, writeJson } from '@/shared/lib/browser-store';
import {
  applyLaunchpadReorder,
  createDefaultLaunchpadItems,
  diskHasLaunchpadItems,
  readLaunchpadItems,
  reindexLaunchpadOrders,
  selectLaunchpadItemsByPlacement,
  type LaunchpadItemConfig,
  type LaunchpadItemId,
  type LaunchpadItems,
  type LaunchpadPlacement,
} from '@/features/settings/lib/launchpad-items';

export type {
  LaunchpadItemConfig,
  LaunchpadItemId,
  LaunchpadItems,
  LaunchpadPlacement,
} from '@/features/settings/lib/launchpad-items';
export {
  applyLaunchpadReorder,
  createDefaultLaunchpadItems,
  isLaunchpadItemId,
  launchpadPreviewPlacement,
  LAUNCHPAD_DROP_INSIDE,
  LAUNCHPAD_DROP_OUTSIDE,
  LAUNCHPAD_ITEM_IDS,
  readLaunchpadItems,
  selectLaunchpadItemsByPlacement,
} from '@/features/settings/lib/launchpad-items';

/** Fast browser cache. Durable copy is ~/.atmos/config/function_settings.json. */
const LAUNCHPAD_ITEMS_STORAGE_KEY = globalKey('launchpad-items');

export interface ExperimentPrefs {
  launchpadItems: LaunchpadItems;
  /** Derived: terminals entry enabled (feature + nav). */
  launchpadTerminalsEnabled: boolean;
  /** Derived: agents entry enabled (feature + nav + footer ACP). */
  launchpadAgentsEnabled: boolean;
  /** Derived: automations entry enabled. */
  automationsEnabled: boolean;
  centerWikiTabEnabled: boolean;
}

interface ExperimentSettingsState extends ExperimentPrefs {
  loaded: boolean;
  loadSettings: () => Promise<void>;
  /** Drop cached prefs so the next Computer re-hydrates function_settings. */
  resetForConnectionChange: () => void;
  /**
   * Toggle an item for a given placement tab.
   * - enabled=true: show the item at this placement (moves from the other tab if needed)
   * - enabled=false: hide only if the item is currently on this placement
   */
  setLaunchpadItemEnabled: (
    id: LaunchpadItemId,
    placement: LaunchpadPlacement,
    enabled: boolean,
  ) => Promise<void>;
  reorderLaunchpadItems: (activeId: string, overId: string) => Promise<void>;
  /** Persist an already-computed Launchpad layout (used after live drag). */
  commitLaunchpadItems: (nextItems: LaunchpadItems) => Promise<void>;
  setLaunchpadTerminalsEnabled: (value: boolean) => Promise<void>;
  setLaunchpadAgentsEnabled: (value: boolean) => Promise<void>;
  setAutomationsEnabled: (value: boolean) => Promise<void>;
  setCenterWikiTabEnabled: (value: boolean) => Promise<void>;
}

let loadInflight: Promise<void> | null = null;
/** Bumped on computer switch so in-flight loads cannot commit after reset. */
let loadEpoch = 0;

function deriveFlags(items: LaunchpadItems) {
  return {
    launchpadTerminalsEnabled: items.terminals.enabled,
    launchpadAgentsEnabled: items.agents.enabled,
    automationsEnabled: items.automations.enabled,
  };
}

function persistLocalLaunchpadItems(items: LaunchpadItems) {
  writeJson(LAUNCHPAD_ITEMS_STORAGE_KEY, items);
}

function readLocalLaunchpadItems(): LaunchpadItems | null {
  const raw = readJson<unknown>(LAUNCHPAD_ITEMS_STORAGE_KEY, null);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  return readLaunchpadItems({ launchpad_items: raw });
}

function readExperiments(raw: unknown): ExperimentPrefs {
  const section =
    raw && typeof raw === 'object' && 'experiments' in raw
      ? (raw as { experiments?: unknown }).experiments
      : undefined;
  const ex = section && typeof section === 'object' ? (section as Record<string, unknown>) : undefined;
  const launchpadItems = readLaunchpadItems(ex);
  return {
    launchpadItems,
    ...deriveFlags(launchpadItems),
    centerWikiTabEnabled: ex?.center_wiki_tab === true,
  };
}

async function persistLaunchpadItems(items: LaunchpadItems): Promise<void> {
  persistLocalLaunchpadItems(items);
  await functionSettingsApi.update('experiments', 'launchpad_items', items);
  useFunctionSettingsStore.getState().invalidate();
}

function initialLaunchpadItems(): LaunchpadItems {
  return readLocalLaunchpadItems() ?? createDefaultLaunchpadItems();
}

export const useExperimentSettingsStore = create<ExperimentSettingsState>((set, get) => {
  const defaultItems = initialLaunchpadItems();
  return {
    launchpadItems: defaultItems,
    ...deriveFlags(defaultItems),
    centerWikiTabEnabled: false,
    loaded: false,

    resetForConnectionChange: () => {
      // Invalidate any in-flight load from the previous Computer.
      loadEpoch += 1;
      loadInflight = null;
      // Drop the device cache so an empty disk on the next Computer does not
      // inherit the previous Computer's Launchpad layout.
      removeKey(LAUNCHPAD_ITEMS_STORAGE_KEY);
      const nextDefaults = createDefaultLaunchpadItems();
      set({
        launchpadItems: nextDefaults,
        ...deriveFlags(nextDefaults),
        centerWikiTabEnabled: false,
        loaded: false,
      });
    },

    loadSettings: async () => {
      if (get().loaded) return;

      if (loadInflight) return loadInflight;

      const requestEpoch = loadEpoch;
      const promise = (async () => {
        try {
          const settings = await useFunctionSettingsStore.getState().load();
          // Computer switch (or a newer load generation) while we were awaiting.
          if (requestEpoch !== loadEpoch) return;
          const local = readLocalLaunchpadItems();
          if (!diskHasLaunchpadItems(settings) && local) {
            // Cache hit, empty disk → migrate local layout onto ~/.atmos.
            set({
              launchpadItems: local,
              ...deriveFlags(local),
              centerWikiTabEnabled: readExperiments(settings).centerWikiTabEnabled,
              loaded: true,
            });
            void persistLaunchpadItems(local).catch(() => {
              // Offline: localStorage still holds the layout.
            });
            return;
          }
          const prefs = readExperiments(settings);
          persistLocalLaunchpadItems(prefs.launchpadItems);
          set({ ...prefs, loaded: true });
        } catch {
          // Keep loaded false so callers can retry (e.g. after WS reconnect).
        } finally {
          // Clear inflight only if this request's epoch still owns the generation.
          // Equiv. to reference equality: reset bumps loadEpoch and nulls loadInflight,
          // so a stale finally must not clear a newer generation's promise.
          if (requestEpoch === loadEpoch) {
            loadInflight = null;
          }
        }
      })();
      loadInflight = promise;

      return promise;
    },

    setLaunchpadItemEnabled: async (id, placement, enabled) => {
      const prevItems = get().launchpadItems;
      const current = prevItems[id];

      let nextConfig: LaunchpadItemConfig;
      if (enabled) {
        const destCount = selectLaunchpadItemsByPlacement(prevItems, placement).filter(
          (itemId) => itemId !== id,
        ).length;
        nextConfig = { enabled: true, placement, order: destCount };
      } else if (current.enabled && current.placement === placement) {
        nextConfig = { ...current, enabled: false, placement };
      } else {
        // Switch off on a tab that doesn't currently own the item — no-op.
        return;
      }

      const nextItems = reindexLaunchpadOrders({
        ...prevItems,
        [id]: nextConfig,
      });

      set({
        launchpadItems: nextItems,
        ...deriveFlags(nextItems),
      });

      try {
        await persistLaunchpadItems(nextItems);
      } catch {
        // Only roll back when no later toggle replaced this optimistic state.
        if (get().launchpadItems !== nextItems) return;
        set({
          launchpadItems: prevItems,
          ...deriveFlags(prevItems),
        });
      }
    },

    commitLaunchpadItems: async (nextItems) => {
      const prevItems = get().launchpadItems;
      if (prevItems === nextItems) return;
      set({
        launchpadItems: nextItems,
        ...deriveFlags(nextItems),
      });
      try {
        await persistLaunchpadItems(nextItems);
      } catch {
        if (get().launchpadItems !== nextItems) return;
        set({
          launchpadItems: prevItems,
          ...deriveFlags(prevItems),
        });
      }
    },

    reorderLaunchpadItems: async (activeId, overId) => {
      const prevItems = get().launchpadItems;
      const nextItems = applyLaunchpadReorder(prevItems, activeId, overId);
      if (!nextItems) return;

      set({
        launchpadItems: nextItems,
        ...deriveFlags(nextItems),
      });

      try {
        await persistLaunchpadItems(nextItems);
      } catch {
        if (get().launchpadItems !== nextItems) return;
        set({
          launchpadItems: prevItems,
          ...deriveFlags(prevItems),
        });
      }
    },

    setLaunchpadTerminalsEnabled: async (value) => {
      const placement = get().launchpadItems.terminals.placement;
      await get().setLaunchpadItemEnabled('terminals', placement, value);
    },

    setLaunchpadAgentsEnabled: async (value) => {
      const placement = get().launchpadItems.agents.placement;
      await get().setLaunchpadItemEnabled('agents', placement, value);
    },

    setAutomationsEnabled: async (value) => {
      const placement = get().launchpadItems.automations.placement;
      await get().setLaunchpadItemEnabled('automations', placement, value);
    },

    setCenterWikiTabEnabled: async (value) => {
      const prev = get().centerWikiTabEnabled;
      set({ centerWikiTabEnabled: value });
      try {
        await functionSettingsApi.update('experiments', 'center_wiki_tab', value);
        useFunctionSettingsStore.getState().invalidate();
      } catch {
        set({ centerWikiTabEnabled: prev });
      }
    },
  };
});
