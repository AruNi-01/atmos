'use client';

import { create } from 'zustand';
import { functionSettingsApi } from '@/api/ws-api';
import { useFunctionSettingsStore } from '@/features/settings/store/function-settings-store';

export type ManagementCenterItemId =
  | 'workspaces'
  | 'skills'
  | 'terminals'
  | 'agents'
  | 'automations'
  | 'disk-analyzer'
  | 'canvas'
  | 'kanban'
  | 'new-workspace';

export type ManagementCenterPlacement = 'inside' | 'outside';

export type ManagementCenterItemConfig = {
  enabled: boolean;
  placement: ManagementCenterPlacement;
};

export type ManagementCenterItems = Record<ManagementCenterItemId, ManagementCenterItemConfig>;

export const MANAGEMENT_CENTER_ITEM_IDS: ManagementCenterItemId[] = [
  'workspaces',
  'skills',
  'terminals',
  'agents',
  'automations',
  'disk-analyzer',
  'canvas',
  'kanban',
  'new-workspace',
];

/** Items that shipped always-on before per-item switches; default enabled inside. */
const ALWAYS_ON_DEFAULT_IDS: ManagementCenterItemId[] = [
  'workspaces',
  'skills',
  'disk-analyzer',
  'canvas',
  'kanban',
  'new-workspace',
];

export function createDefaultManagementCenterItems(): ManagementCenterItems {
  const items = {} as ManagementCenterItems;
  for (const id of MANAGEMENT_CENTER_ITEM_IDS) {
    items[id] = {
      enabled: ALWAYS_ON_DEFAULT_IDS.includes(id),
      placement: 'inside',
    };
  }
  return items;
}

function isPlacement(value: unknown): value is ManagementCenterPlacement {
  return value === 'inside' || value === 'outside';
}

function readItemConfig(
  raw: unknown,
  fallback: ManagementCenterItemConfig,
): ManagementCenterItemConfig {
  if (!raw || typeof raw !== 'object') return fallback;
  const record = raw as Record<string, unknown>;
  return {
    enabled: typeof record.enabled === 'boolean' ? record.enabled : fallback.enabled,
    placement: isPlacement(record.placement) ? record.placement : fallback.placement,
  };
}

/** Parse Management Center item config from experiments settings (incl. legacy flags). */
export function readManagementCenterItems(ex: Record<string, unknown> | undefined): ManagementCenterItems {
  const defaults = createDefaultManagementCenterItems();

  // Legacy experiment flags (pre per-item map).
  if (ex?.mgmt_terminals === true) {
    defaults.terminals = { enabled: true, placement: 'inside' };
  }
  if (ex?.mgmt_agents === true) {
    defaults.agents = { enabled: true, placement: 'inside' };
  }
  if (ex?.automations === true) {
    defaults.automations = { enabled: true, placement: 'inside' };
  }

  const rawItems = ex?.mgmt_center_items;
  if (!rawItems || typeof rawItems !== 'object') {
    return defaults;
  }

  const source = rawItems as Record<string, unknown>;
  const merged = { ...defaults };
  for (const id of MANAGEMENT_CENTER_ITEM_IDS) {
    if (id in source) {
      merged[id] = readItemConfig(source[id], defaults[id]);
    }
  }
  return merged;
}

export interface ExperimentPrefs {
  managementCenterItems: ManagementCenterItems;
  /** Derived: terminals entry enabled (feature + nav). */
  managementTerminalsEnabled: boolean;
  /** Derived: agents entry enabled (feature + nav + footer ACP). */
  managementAgentsEnabled: boolean;
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
  setManagementCenterItemEnabled: (
    id: ManagementCenterItemId,
    placement: ManagementCenterPlacement,
    enabled: boolean,
  ) => Promise<void>;
  setManagementTerminalsEnabled: (value: boolean) => Promise<void>;
  setManagementAgentsEnabled: (value: boolean) => Promise<void>;
  setAutomationsEnabled: (value: boolean) => Promise<void>;
  setCenterWikiTabEnabled: (value: boolean) => Promise<void>;
}

let loadInflight: Promise<void> | null = null;

function deriveFlags(items: ManagementCenterItems) {
  return {
    managementTerminalsEnabled: items.terminals.enabled,
    managementAgentsEnabled: items.agents.enabled,
    automationsEnabled: items.automations.enabled,
  };
}

function readExperiments(raw: unknown): ExperimentPrefs {
  const section =
    raw && typeof raw === 'object' && 'experiments' in raw
      ? (raw as { experiments?: unknown }).experiments
      : undefined;
  const ex = section && typeof section === 'object' ? (section as Record<string, unknown>) : undefined;
  const managementCenterItems = readManagementCenterItems(ex);
  return {
    managementCenterItems,
    ...deriveFlags(managementCenterItems),
    centerWikiTabEnabled: ex?.center_wiki_tab === true,
  };
}

async function persistManagementCenterItems(items: ManagementCenterItems): Promise<void> {
  await functionSettingsApi.update('experiments', 'mgmt_center_items', items);
  useFunctionSettingsStore.getState().invalidate();
}

export const useExperimentSettingsStore = create<ExperimentSettingsState>((set, get) => {
  const defaultItems = createDefaultManagementCenterItems();
  return {
    managementCenterItems: defaultItems,
    ...deriveFlags(defaultItems),
    centerWikiTabEnabled: false,
    loaded: false,

    resetForConnectionChange: () => {
      loadInflight = null;
      const nextDefaults = createDefaultManagementCenterItems();
      set({
        managementCenterItems: nextDefaults,
        ...deriveFlags(nextDefaults),
        centerWikiTabEnabled: false,
        loaded: false,
      });
    },

    loadSettings: async () => {
      if (get().loaded) return;

      if (loadInflight) return loadInflight;

      loadInflight = (async () => {
        try {
          const settings = await useFunctionSettingsStore.getState().load();
          const prefs = readExperiments(settings);
          set({ ...prefs, loaded: true });
        } catch {
          // Keep loaded false so callers can retry (e.g. after WS reconnect).
        } finally {
          loadInflight = null;
        }
      })();

      return loadInflight;
    },

    setManagementCenterItemEnabled: async (id, placement, enabled) => {
      const prevItems = get().managementCenterItems;
      const current = prevItems[id];

      let nextConfig: ManagementCenterItemConfig;
      if (enabled) {
        nextConfig = { enabled: true, placement };
      } else if (current.enabled && current.placement === placement) {
        nextConfig = { enabled: false, placement };
      } else {
        // Switch off on a tab that doesn't currently own the item — no-op.
        return;
      }

      const nextItems: ManagementCenterItems = {
        ...prevItems,
        [id]: nextConfig,
      };

      set({
        managementCenterItems: nextItems,
        ...deriveFlags(nextItems),
      });

      try {
        await persistManagementCenterItems(nextItems);
      } catch {
        // Only roll back when no later toggle replaced this optimistic state.
        if (get().managementCenterItems !== nextItems) return;
        set({
          managementCenterItems: prevItems,
          ...deriveFlags(prevItems),
        });
      }
    },

    setManagementTerminalsEnabled: async (value) => {
      const placement = get().managementCenterItems.terminals.placement;
      await get().setManagementCenterItemEnabled('terminals', placement, value);
    },

    setManagementAgentsEnabled: async (value) => {
      const placement = get().managementCenterItems.agents.placement;
      await get().setManagementCenterItemEnabled('agents', placement, value);
    },

    setAutomationsEnabled: async (value) => {
      const placement = get().managementCenterItems.automations.placement;
      await get().setManagementCenterItemEnabled('automations', placement, value);
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

export function selectManagementCenterItemsByPlacement(
  items: ManagementCenterItems,
  placement: ManagementCenterPlacement,
): ManagementCenterItemId[] {
  return MANAGEMENT_CENTER_ITEM_IDS.filter(
    (id) => items[id].enabled && items[id].placement === placement,
  );
}
