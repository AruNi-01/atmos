export type LaunchpadItemId =
  | 'workspaces'
  | 'skills'
  | 'terminals'
  | 'agents'
  | 'automations'
  | 'disk-analyzer'
  | 'token-usage'
  | 'agent-observer'
  | 'canvas'
  | 'pt-design'
  | 'tasks'
  | 'new-workspace';

export type LaunchpadPlacement = 'inside' | 'outside';

export type LaunchpadItemConfig = {
  enabled: boolean;
  placement: LaunchpadPlacement;
  order: number;
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
  'agent-observer',
  'canvas',
  'pt-design',
  'tasks',
  'new-workspace',
];

export const LAUNCHPAD_DROP_INSIDE = 'launchpad-drop-inside';
export const LAUNCHPAD_DROP_OUTSIDE = 'launchpad-drop-outside';

const LAUNCHPAD_ITEM_ID_SET = new Set<string>(LAUNCHPAD_ITEM_IDS);

/** Items that default enabled in Launchpad. */
const ALWAYS_ON_DEFAULT_IDS: LaunchpadItemId[] = [
  'workspaces',
  'skills',
  'automations',
  'disk-analyzer',
  'token-usage',
  'agent-observer',
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
  'agent-observer',
  'canvas',
  'pt-design',
  'tasks',
  'new-workspace',
];

export function isLaunchpadItemId(value: string): value is LaunchpadItemId {
  return LAUNCHPAD_ITEM_ID_SET.has(value);
}

export function createDefaultLaunchpadItems(): LaunchpadItems {
  const items = {} as LaunchpadItems;
  for (const [index, id] of LAUNCHPAD_ITEM_IDS.entries()) {
    items[id] = {
      enabled: ALWAYS_ON_DEFAULT_IDS.includes(id),
      placement: DEFAULT_OUTSIDE_PLACEMENT_IDS.includes(id) ? 'outside' : 'inside',
      order: index,
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
    order:
      typeof record.order === 'number' && Number.isFinite(record.order)
        ? record.order
        : fallback.order,
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

export function selectLaunchpadItemsByPlacement(
  items: LaunchpadItems,
  placement: LaunchpadPlacement,
): LaunchpadItemId[] {
  return LAUNCHPAD_ITEM_IDS.filter(
    (id) => items[id].enabled && items[id].placement === placement,
  ).sort((a, b) => {
    const delta = items[a].order - items[b].order;
    if (delta !== 0) return delta;
    return LAUNCHPAD_ITEM_IDS.indexOf(a) - LAUNCHPAD_ITEM_IDS.indexOf(b);
  });
}

export function reindexLaunchpadOrders(items: LaunchpadItems): LaunchpadItems {
  const next = { ...items };
  for (const placement of ['inside', 'outside'] as const) {
    const ids = selectLaunchpadItemsByPlacement(items, placement);
    for (const [index, id] of ids.entries()) {
      if (next[id].order !== index || next[id].placement !== placement) {
        next[id] = { ...next[id], placement, order: index };
      }
    }
  }
  return next;
}

function dropPlacementFromOverId(overId: string): LaunchpadPlacement | null {
  if (overId === LAUNCHPAD_DROP_INSIDE) return 'inside';
  if (overId === LAUNCHPAD_DROP_OUTSIDE) return 'outside';
  return null;
}

/** Shape the drag preview should take while hovering a Launchpad drop target. */
export function launchpadPreviewPlacement(
  overId: string | null | undefined,
  items: LaunchpadItems,
  fallback: LaunchpadPlacement,
): LaunchpadPlacement {
  if (overId == null) return fallback;
  const container = dropPlacementFromOverId(overId);
  if (container) return container;
  if (isLaunchpadItemId(overId)) return items[overId].placement;
  return fallback;
}

function moveIndex<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0) return list;
  const next = list.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/** Reorder or move an enabled Launchpad item. Returns null when the drop is a no-op. */
export function applyLaunchpadReorder(
  items: LaunchpadItems,
  activeId: string,
  overId: string,
): LaunchpadItems | null {
  if (!isLaunchpadItemId(activeId) || activeId === overId) return null;
  const active = items[activeId];
  if (!active.enabled) return null;

  const containerPlacement = dropPlacementFromOverId(overId);
  const overItemId = isLaunchpadItemId(overId) ? overId : null;
  if (!containerPlacement && !overItemId) return null;

  const destPlacement = containerPlacement ?? items[overItemId!].placement;
  if (containerPlacement && containerPlacement === active.placement && !overItemId) {
    return null;
  }

  const destList = selectLaunchpadItemsByPlacement(items, destPlacement);
  const activeIndex = destList.indexOf(activeId);
  let nextDest: LaunchpadItemId[];

  if (overItemId && items[overItemId].placement === destPlacement) {
    const overIndex = destList.indexOf(overItemId);
    if (activeIndex !== -1) {
      // Same list: occupy the hovered slot (dnd-kit arrayMove), not "insert before".
      nextDest = moveIndex(destList, activeIndex, overIndex);
    } else {
      nextDest = destList.slice();
      nextDest.splice(Math.max(0, overIndex), 0, activeId);
    }
  } else {
    nextDest = destList.filter((id) => id !== activeId);
    nextDest.push(activeId);
  }

  const sourcePlacement = active.placement;
  const next: LaunchpadItems = {
    ...items,
    [activeId]: { ...active, enabled: true, placement: destPlacement },
  };

  for (const [index, id] of nextDest.entries()) {
    next[id] = { ...next[id], placement: destPlacement, order: index };
  }

  if (sourcePlacement !== destPlacement) {
    const sourceList = selectLaunchpadItemsByPlacement(items, sourcePlacement).filter(
      (id) => id !== activeId,
    );
    for (const [index, id] of sourceList.entries()) {
      next[id] = { ...next[id], order: index };
    }
  }

  return reindexLaunchpadOrders(next);
}

export function diskHasLaunchpadItems(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object' || !('experiments' in raw)) return false;
  const experiments = (raw as { experiments?: unknown }).experiments;
  if (!experiments || typeof experiments !== 'object') return false;
  const items = (experiments as { launchpad_items?: unknown }).launchpad_items;
  return Boolean(items) && typeof items === 'object';
}
