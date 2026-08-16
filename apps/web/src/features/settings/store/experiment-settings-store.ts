'use client';

import { create } from 'zustand';
import { functionSettingsApi } from '@/api/ws-api';
import { useFunctionSettingsStore } from '@/features/settings/store/function-settings-store';

export type LaunchpadItemId =
  | 'workspaces'
  | 'skills'
  | 'terminals'
  | 'agents'
  | 'automations'
  | 'disk-analyzer'
  | 'token-usage'
  | 'canvas'
  | 'pt-design'
  | 'tasks'
  | 'new-workspace';

export type LaunchpadPlacement = 'inside' | 'outside';

export type LaunchpadItemConfig = {
  enabled: boolean;
  placement: LaunchpadPlacement;
};

export type LaunchpadItems = Record<LaunchpadItemId, LaunchpadItemConfig>;

export const LAUNCHPAD_ITEM_IDS: LaunchpadItemId[] = [
  'workspaces',
  'skills',
  'terminals',
  'agents',
  'automations',
  'disk-analyzer',
  'token-usage',
  'canvas',
  'pt-design',
  'tasks',
  'new-workspace',
];

/** Items that default enabled in Launchpad. */
const ALWAYS_ON_DEFAULT_IDS: LaunchpadItemId[] = [
  'workspaces',
  'skills',
  'automations',
  'disk-analyzer',
  'token-usage',
  'canvas',
  'pt-design',
  'tasks',
  'new-workspace',
];

/** Default to Outside (full-width list under Launchpad header) rather than Inside grid. */
const DEFAULT_OUTSIDE_PLACEMENT_IDS: LaunchpadItemId[] = [
  'skills',
  'automations',
  'token-usage',
  'canvas',
  'pt-design',
  'tasks',
  'new-workspace',
];

export function createDefaultLaunchpadItems(): LaunchpadItems {
  const items = {} as LaunchpadItems;
  for (const id of LAUNCHPAD_ITEM_IDS) {
    items[id] = {
      enabled: ALWAYS_ON_DEFAULT_IDS.includes(id),
      placement: DEFAULT_OUTSIDE_PLACEMENT_IDS.includes(id) ? 'outside' : 'inside',
    };
  }
  return items;
}

function isPlacement(value: unknown): value is LaunchpadPlacement {
  return value === 'inside' || value === 'outside';
}

function readItemConfig(
  raw: unknown,
  fallback: LaunchpadItemConfig,
): LaunchpadItemConfig {
  if (!raw || typeof raw !== 'object') return fallback;
  const record = raw as Record<string, unknown>;
  return {
    enabled: typeof record.enabled === 'boolean' ? record.enabled : fallback.enabled,
    placement: isPlacement(record.placement) ? record.placement : fallback.placement,
  };
}

/** Parse Launchpad item config from experiments settings. */
export function readLaunchpadItems(ex: Record<string, unknown> | undefined): LaunchpadItems {
  const defaults = createDefaultLaunchpadItems();
  const rawItems = ex?.launchpad_items;
  if (!rawItems || typeof rawItems !== 'object') {
    return defaults;
  }

  const source = rawItems as Record<string, unknown>;
  const merged = { ...defaults };
  for (const id of LAUNCHPAD_ITEM_IDS) {
    if (id in source) {
      merged[id] = readItemConfig(source[id], defaults[id]);
    }
  }
  return merged;
}

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
  await functionSettingsApi.update('experiments', 'launchpad_items', items);
  useFunctionSettingsStore.getState().invalidate();
}

export const useExperimentSettingsStore = create<ExperimentSettingsState>((set, get) => {
  const defaultItems = createDefaultLaunchpadItems();
  return {
    launchpadItems: defaultItems,
    ...deriveFlags(defaultItems),
    centerWikiTabEnabled: false,
    loaded: false,

    resetForConnectionChange: () => {
      // Invalidate any in-flight load from the previous Computer.
      loadEpoch += 1;
      loadInflight = null;
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
          const prefs = readExperiments(settings);
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
        nextConfig = { enabled: true, placement };
      } else if (current.enabled && current.placement === placement) {
        nextConfig = { enabled: false, placement };
      } else {
        // Switch off on a tab that doesn't currently own the item — no-op.
        return;
      }

      const nextItems: LaunchpadItems = {
        ...prevItems,
        [id]: nextConfig,
      };

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

export function selectLaunchpadItemsByPlacement(
  items: LaunchpadItems,
  placement: LaunchpadPlacement,
): LaunchpadItemId[] {
  return LAUNCHPAD_ITEM_IDS.filter(
    (id) => items[id].enabled && items[id].placement === placement,
  );
}
