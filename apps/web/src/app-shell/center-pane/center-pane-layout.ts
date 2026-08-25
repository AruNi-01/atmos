/**
 * Pure multi-center-pane layout math (binary split tree + tab ownership).
 * Free of React so unit tests can drive the model without DOM.
 */

import {
  getLeaves,
  isTerminalLayoutBranch,
  removePaneFromLayoutTree,
  splitPaneInLayoutTree,
  type TerminalLayoutNode,
} from "@/features/terminal/lib/terminal-layout-tree";

export const MAX_CENTER_PANES = 4;
export const MIN_FRACTION = 0.15;
export const DEFAULT_PANE_ID = "pane-main";
export const OVERVIEW_TAB_ID = "overview";
export const FALLBACK_SECONDARY_TAB_ID = "terminal";
const TERMINAL_TAB_PREFIX = "terminal-tab:";
const BROWSER_TAB_PREFIX = "browser:";

/**
 * Live sessions cannot be cloned across panes (one PTY / one webview).
 * Everything else (Files, Changes, the same editor path, Overview, …) can
 * live in multiple isolated pane strips at once.
 */
export function isShareableCenterTabId(tabId: string): boolean {
  if (!tabId) return false;
  if (tabId === "terminal" || tabId.startsWith(TERMINAL_TAB_PREFIX)) return false;
  if (tabId.startsWith(BROWSER_TAB_PREFIX)) return false;
  if (tabId === "project-wiki" || tabId === "code-review") return false;
  return true;
}
/** Sentinel active id for a pane that has no tabs yet (empty launcher state). */
export const EMPTY_PANE_ACTIVE_TAB_ID = "";

export type CenterPane = {
  id: string;
  /** Tab values owned by this pane (strip order). Empty = launcher empty state. */
  tabIds: string[];
  activeTabId: string;
};

export function isEmptyPane(pane: CenterPane | undefined | null): boolean {
  return !pane || pane.tabIds.length === 0;
}

export function createEmptyPane(id: string): CenterPane {
  return { id, tabIds: [], activeTabId: EMPTY_PANE_ACTIVE_TAB_ID };
}

/** Brand-new extra space: one empty launcher pane, no inherited tabs. */
export function createEmptyCenterLayout(): CenterPaneLayout {
  return withCanonicalTabStrip({
    panes: [createEmptyPane(DEFAULT_PANE_ID)],
    order: [DEFAULT_PANE_ID],
    tree: DEFAULT_PANE_ID,
    columnCount: 1,
    columnFractions: [1],
    rowFractions: [1],
    focusedPaneId: DEFAULT_PANE_ID,
  });
}

export function isFreshEmptyCenterLayout(layout: CenterPaneLayout): boolean {
  return layout.panes.length === 1 && isEmptyPane(layout.panes[0]);
}

/** Mosaic tree of pane ids — same algorithm as in-pane Terminal split. */
export type CenterPaneTree = TerminalLayoutNode<string>;

export type CenterPaneLayout = {
  panes: CenterPane[];
  /** Reading order (tree leaves). */
  order: string[];
  /**
   * Binary split tree that always tiles the stage. Older persisted layouts
   * may omit this; {@link normalizeCenterPaneLayout} synthesizes one.
   */
  tree?: CenterPaneTree;
  columnCount: number;
  columnFractions: number[];
  rowFractions: number[];
  focusedPaneId: string;
  /**
   * Once true, `pane.tabIds` is the strip source of truth. Absent on layouts
   * persisted before this field existed so {@link migrateLegacySinglePaneStripOrder}
   * can apply stored `tabStripOrder` exactly once.
   */
  tabStripCanonical?: boolean;
};

export type SplitDirection = "right" | "down";

export function rowCountFor(paneCount: number, columnCount: number): number {
  if (paneCount <= 0) return 1;
  const cols = Math.max(1, columnCount);
  return Math.max(1, Math.ceil(paneCount / cols));
}

export function normalizeFractions(values: number[], expectedLength: number): number[] {
  const length = Math.max(1, expectedLength);
  if (values.length !== length) {
    return equalFractions(length);
  }
  const safe = values.map((v) => (Number.isFinite(v) && v > 0 ? v : 0));
  const sum = safe.reduce((a, b) => a + b, 0);
  if (sum <= 0) return equalFractions(length);
  return safe.map((v) => v / sum);
}

export function equalFractions(count: number): number[] {
  const n = Math.max(1, count);
  return Array.from({ length: n }, () => 1 / n);
}

export function createPaneId(existing: Iterable<string> = []): string {
  const used = new Set(existing);
  let i = 1;
  while (used.has(`pane-${i}`)) i += 1;
  return `pane-${i}`;
}

/** Single pane owning every open tab — matches classic Center Stage. */
export function createDefaultLayout(tabIds: string[], activeTabId: string): CenterPaneLayout {
  const ids = tabIds.length > 0 ? [...tabIds] : [activeTabId || "terminal"];
  const active = ids.includes(activeTabId) ? activeTabId : ids[0]!;
  return {
    panes: [
      {
        id: DEFAULT_PANE_ID,
        tabIds: ids,
        activeTabId: active,
      },
    ],
    order: [DEFAULT_PANE_ID],
    tree: DEFAULT_PANE_ID,
    columnCount: 1,
    columnFractions: [1],
    rowFractions: [1],
    focusedPaneId: DEFAULT_PANE_ID,
  };
}

function joinEqual(ids: CenterPaneTree[], direction: "row" | "column"): CenterPaneTree {
  if (ids.length === 0) return DEFAULT_PANE_ID;
  if (ids.length === 1) return ids[0]!;
  if (ids.length === 2) {
    return {
      direction,
      first: ids[0]!,
      second: ids[1]!,
      splitPercentage: 50,
    };
  }
  const mid = Math.ceil(ids.length / 2);
  return {
    direction,
    first: joinEqual(ids.slice(0, mid), direction),
    second: joinEqual(ids.slice(mid), direction),
    splitPercentage: (mid / ids.length) * 100,
  };
}

/** Build a tiling tree from row-major order so leftover cells still fill the stage. */
export function treeFromReadingOrder(
  order: string[],
  columnCount = 2,
): CenterPaneTree {
  if (order.length === 0) return DEFAULT_PANE_ID;
  if (order.length === 1) return order[0]!;
  const cols = Math.max(1, Math.min(order.length, Math.floor(columnCount) || 2));
  const rows: string[][] = [];
  for (let i = 0; i < order.length; i += cols) {
    rows.push(order.slice(i, i + cols));
  }
  return joinEqual(
    rows.map((row) => joinEqual(row, "row")),
    "column",
  );
}

function treeLeavesMatchPanes(
  tree: CenterPaneTree,
  paneIds: ReadonlySet<string>,
): boolean {
  const leaves = getLeaves(tree);
  if (leaves.length !== paneIds.size) return false;
  const seen = new Set<string>();
  for (const id of leaves) {
    if (!paneIds.has(id) || seen.has(id)) return false;
    seen.add(id);
  }
  return true;
}

function centerPaneTreesEqual(a: CenterPaneTree, b: CenterPaneTree): boolean {
  if (a === b) return true;
  if (!isTerminalLayoutBranch(a) || !isTerminalLayoutBranch(b)) return a === b;
  return (
    a.direction === b.direction &&
    Math.abs((a.splitPercentage ?? 50) - (b.splitPercentage ?? 50)) < 1e-6 &&
    centerPaneTreesEqual(a.first, b.first) &&
    centerPaneTreesEqual(a.second, b.second)
  );
}

/** Ensure `tree` tiles every pane exactly once and `order` follows its leaves. */
export function normalizeCenterPaneLayout(layout: CenterPaneLayout): CenterPaneLayout {
  const paneIds = new Set(layout.panes.map((pane) => pane.id));
  const existingTree = layout.tree;
  const tree =
    existingTree && treeLeavesMatchPanes(existingTree, paneIds)
      ? existingTree
      : treeFromReadingOrder(
          [
            ...layout.order.filter((id) => paneIds.has(id)),
            ...layout.panes.map((pane) => pane.id).filter((id) => !layout.order.includes(id)),
          ],
          layout.columnCount || 2,
        );
  const order = getLeaves(tree);
  const focusedPaneId = paneIds.has(layout.focusedPaneId)
    ? layout.focusedPaneId
    : (order[0] ?? DEFAULT_PANE_ID);
  return syncFractionsToPaneCount({
    ...layout,
    tree,
    order,
    focusedPaneId,
  });
}

export function getPane(layout: CenterPaneLayout, paneId: string): CenterPane | undefined {
  return layout.panes.find((p) => p.id === paneId);
}

export function getFocusedPane(layout: CenterPaneLayout): CenterPane {
  return getPane(layout, layout.focusedPaneId) ?? layout.panes[0]!;
}

/** Primary pane: original main stage — never closed; only home for Overview. */
export function getPrimaryPaneId(layout: CenterPaneLayout): string {
  if (layout.panes.some((p) => p.id === DEFAULT_PANE_ID)) return DEFAULT_PANE_ID;
  return layout.order[0] ?? layout.panes[0]?.id ?? DEFAULT_PANE_ID;
}

export function isPrimaryPane(layout: CenterPaneLayout, paneId: string): boolean {
  return getPrimaryPaneId(layout) === paneId;
}

/** Keep a single Overview tab pinned at the front of the pane strip. */
export function pinOverviewFront(tabIds: readonly string[]): string[] {
  if (!tabIds.includes(OVERVIEW_TAB_ID)) return [...tabIds];
  return [OVERVIEW_TAB_ID, ...tabIds.filter((id) => id !== OVERVIEW_TAB_ID)];
}

function addPinnedOverview(tabIds: readonly string[]): string[] {
  return [OVERVIEW_TAB_ID, ...tabIds.filter((id) => id !== OVERVIEW_TAB_ID)];
}

function pickNonOverviewTab(tabIds: readonly string[], preferred?: string | null): string | null {
  if (preferred && preferred !== OVERVIEW_TAB_ID && tabIds.includes(preferred)) {
    return preferred;
  }
  return tabIds.find((id) => id !== OVERVIEW_TAB_ID) ?? null;
}

/**
 * Next active tab after the current one leaves this pane.
 * Honor `preferred` (MRU) even when it is Overview; otherwise skip Overview
 * so close/steal does not snap to the first strip item.
 */
function pickReplacementActiveTab(
  remainingTabIds: readonly string[],
  preferred?: string | null,
): string {
  if (preferred && remainingTabIds.includes(preferred)) return preferred;
  return remainingTabIds.find((id) => id !== OVERVIEW_TAB_ID) ?? remainingTabIds[0]!;
}

/**
 * Pin Overview at the front of any pane that owns it. Each pane keeps its own
 * Overview independently — it is no longer forced onto the primary pane.
 */
export function enforceOverviewPrimaryOnly(layout: CenterPaneLayout): CenterPaneLayout {
  const panes = layout.panes.map((p) => {
    if (!p.tabIds.includes(OVERVIEW_TAB_ID) && p.activeTabId !== OVERVIEW_TAB_ID) {
      return p;
    }
    const tabIds = pinOverviewFront(p.tabIds);
    if (sameStringList(p.tabIds, tabIds)) return p;
    return { ...p, tabIds };
  });
  const next: CenterPaneLayout = { ...layout, panes };
  return centerPaneLayoutsEqual(layout, next) ? layout : next;
}

/**
 * Close secondary panes that **became** empty after losing their last tab.
 * Intentionally empty split launchers (already `tabIds: []`) are kept so
 * open/activate on another pane does not collapse the multi-pane layout.
 */
export function pruneEmptySecondaryPanes(
  layout: CenterPaneLayout,
  previous?: CenterPaneLayout | null,
): CenterPaneLayout {
  const primaryId = getPrimaryPaneId(layout);
  let next = layout;
  for (const pane of layout.panes) {
    if (pane.id === primaryId) continue;
    const live = getPane(next, pane.id);
    if (!live || live.tabIds.length > 0) continue;
    // Preserve empty launchers created by split (were already empty).
    const wasEmpty =
      previous != null
        ? (getPane(previous, pane.id)?.tabIds.length ?? 0) === 0
        : false;
    if (wasEmpty) continue;
    next = closePane(next, pane.id);
  }
  return next;
}

/** All active tab ids across panes (unique, focus order first). */
export function collectActiveTabIds(layout: CenterPaneLayout): string[] {
  const focused = getFocusedPane(layout).activeTabId;
  const ids: string[] = [];
  const seen = new Set<string>();
  if (focused) {
    ids.push(focused);
    seen.add(focused);
  }
  for (const pane of layout.panes) {
    if (pane.activeTabId && !seen.has(pane.activeTabId)) {
      ids.push(pane.activeTabId);
      seen.add(pane.activeTabId);
    }
  }
  return ids;
}

export function findPaneIdForTab(layout: CenterPaneLayout, tabId: string): string | null {
  const focused = getPane(layout, layout.focusedPaneId);
  if (focused && (focused.tabIds.includes(tabId) || focused.activeTabId === tabId)) {
    return focused.id;
  }
  for (const pane of layout.panes) {
    if (pane.tabIds.includes(tabId) || pane.activeTabId === tabId) {
      return pane.id;
    }
  }
  return null;
}

/** Tab id → owning pane id (active id included so empty-looking actives still map). */
export function buildTabToPaneId(layout: CenterPaneLayout): Record<string, string> {
  const map: Record<string, string> = {};
  for (const pane of layout.panes) {
    for (const tabId of pane.tabIds) {
      map[tabId] = pane.id;
    }
    if (pane.activeTabId) {
      map[pane.activeTabId] = pane.id;
    }
  }
  return map;
}

/** Tab id → every pane that lists it (isolated strips may share shareable tabs). */
export function buildTabHostPaneIds(layout: CenterPaneLayout): Record<string, string[]> {
  const map: Record<string, string[]> = {};
  const add = (tabId: string, paneId: string) => {
    if (!tabId) return;
    const list = map[tabId] ?? (map[tabId] = []);
    if (!list.includes(paneId)) list.push(paneId);
  };
  for (const pane of layout.panes) {
    for (const tabId of pane.tabIds) add(tabId, pane.id);
    if (pane.activeTabId) add(pane.activeTabId, pane.id);
  }
  return map;
}

export function buildPaneActiveTabById(layout: CenterPaneLayout): Record<string, string> {
  const map: Record<string, string> = {};
  for (const pane of layout.panes) {
    if (pane.activeTabId) map[pane.id] = pane.activeTabId;
  }
  return map;
}

export function layoutOwnsTab(layout: CenterPaneLayout, tabId: string): boolean {
  return layout.panes.some(
    (pane) => pane.tabIds.includes(tabId) || pane.activeTabId === tabId,
  );
}

function addTabToPane(pane: CenterPane, tabId: string): CenterPane {
  const tabIds =
    tabId === OVERVIEW_TAB_ID
      ? addPinnedOverview(pane.tabIds)
      : pane.tabIds.includes(tabId)
        ? pane.tabIds
        : [...pane.tabIds, tabId];
  if (pane.activeTabId === tabId && sameStringList(pane.tabIds, tabIds)) return pane;
  return { ...pane, tabIds, activeTabId: tabId };
}

export function withCanonicalTabStrip(layout: CenterPaneLayout): CenterPaneLayout {
  return layout.tabStripCanonical ? layout : { ...layout, tabStripCanonical: true };
}

/**
 * Replace one pane's strip order. Unknown ids are ignored; missing owned ids
 * append so a pane cannot drop tabs via reorder. Sibling panes are untouched.
 */
export function reorderPaneTabIds(
  layout: CenterPaneLayout,
  paneId: string,
  orderedTabIds: readonly string[],
): CenterPaneLayout {
  const pane = getPane(layout, paneId);
  if (!pane) return layout;
  const owned = new Set(pane.tabIds);
  const nextIds = orderedTabIds.filter((id) => owned.has(id));
  for (const id of pane.tabIds) {
    if (!nextIds.includes(id)) nextIds.push(id);
  }
  if (sameStringList(pane.tabIds, nextIds)) {
    return layout.tabStripCanonical ? layout : withCanonicalTabStrip(layout);
  }
  const panes = layout.panes.map((p) => (p.id === paneId ? { ...p, tabIds: nextIds } : p));
  const next: CenterPaneLayout = withCanonicalTabStrip({ ...layout, panes });
  return centerPaneLayoutsEqual(layout, next) ? layout : next;
}

/**
 * Pane `tabIds` are canonical whenever a layout pane exists (including a
 * remaining single pane after collapse). Legacy `tabStripOrder` is only a
 * fallback for empty panes / one-shot migration of pre-canonical layouts.
 */
export function resolvePaneTabStripOrder(
  paneTabIds: readonly string[] | null | undefined,
  legacyStripOrder: readonly string[],
): string[] {
  if (paneTabIds && paneTabIds.length > 0) return [...paneTabIds];
  return [...legacyStripOrder];
}

/**
 * Apply stored single-pane strip prefs onto an existing layout exactly once.
 * Multi-pane layouts and already-canonical layouts ignore global prefs so a
 * later reorder/collapse cannot snap back to stale strip storage.
 */
export function migrateLegacySinglePaneStripOrder(
  layout: CenterPaneLayout,
  legacyStripOrder: readonly string[],
): CenterPaneLayout {
  if (layout.tabStripCanonical) return layout;
  if (layout.order.length !== 1) {
    return withCanonicalTabStrip(layout);
  }
  if (legacyStripOrder.length === 0) return layout;
  const pane = getPane(layout, layout.order[0]!) ?? layout.panes[0];
  if (!pane) return withCanonicalTabStrip(layout);
  const nextIds = applyLegacyStripOrder(pane.tabIds, legacyStripOrder);
  const panes = sameStringList(pane.tabIds, nextIds)
    ? layout.panes
    : layout.panes.map((p) => (p.id === pane.id ? { ...p, tabIds: nextIds } : p));
  return withCanonicalTabStrip({ ...layout, panes });
}

/**
 * Seed a new single-pane layout from persisted strip prefs without dropping
 * open tabs the prefs do not yet list.
 */
export function applyLegacyStripOrder(
  openTabIds: readonly string[],
  legacyStripOrder: readonly string[],
): string[] {
  const open = new Set(openTabIds);
  const ordered: string[] = [];
  for (const id of legacyStripOrder) {
    if (!open.has(id) || ordered.includes(id)) continue;
    ordered.push(id);
  }
  for (const id of openTabIds) {
    if (!ordered.includes(id)) ordered.push(id);
  }
  return ordered;
}

/** Replace the mosaic tree (drag-dock / split-resize). Panes stay owned. */
export function applyCenterPaneTree(
  layout: CenterPaneLayout,
  tree: CenterPaneTree,
): CenterPaneLayout {
  return normalizeCenterPaneLayout({ ...layout, tree });
}

export function reorderPanes(layout: CenterPaneLayout, fromIndex: number, toIndex: number): CenterPaneLayout {
  if (
    fromIndex === toIndex ||
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= layout.order.length ||
    toIndex >= layout.order.length
  ) {
    return layout;
  }
  const order = [...layout.order];
  const [item] = order.splice(fromIndex, 1);
  if (!item) return layout;
  order.splice(toIndex, 0, item);
  return { ...layout, order };
}

/**
 * Resize two adjacent fractions so the boundary between `index` and `index+1`
 * moves by `delta` (positive grows the left/top side). Clamped to MIN_FRACTION.
 */
export function resizeAdjacentFractions(
  fractions: number[],
  index: number,
  delta: number,
): number[] {
  if (index < 0 || index >= fractions.length - 1) return fractions;
  const next = [...fractions];
  const a = next[index]!;
  const b = next[index + 1]!;
  let na = a + delta;
  let nb = b - delta;
  if (na < MIN_FRACTION) {
    nb -= MIN_FRACTION - na;
    na = MIN_FRACTION;
  }
  if (nb < MIN_FRACTION) {
    na -= MIN_FRACTION - nb;
    nb = MIN_FRACTION;
  }
  if (na < MIN_FRACTION || nb < MIN_FRACTION) return fractions;
  next[index] = na;
  next[index + 1] = nb;
  return normalizeFractions(next, next.length);
}

export function syncFractionsToPaneCount(layout: CenterPaneLayout): CenterPaneLayout {
  const paneCount = layout.order.length;
  const columnCount = Math.min(MAX_CENTER_PANES, Math.max(1, layout.columnCount));
  const rows = rowCountFor(paneCount, columnCount);
  return {
    ...layout,
    columnCount,
    columnFractions: normalizeFractions(layout.columnFractions, columnCount),
    rowFractions: normalizeFractions(layout.rowFractions, rows),
  };
}

export function setColumnCount(layout: CenterPaneLayout, columnCount: number): CenterPaneLayout {
  const cols = Math.min(MAX_CENTER_PANES, Math.max(1, Math.floor(columnCount)));
  return syncFractionsToPaneCount({ ...layout, columnCount: cols });
}

/**
 * Split focused pane: create a **new empty** pane (launcher empty state).
 * Never moves tabs out of the source pane.
 */
export function splitPane(
  layout: CenterPaneLayout,
  options: {
    direction: SplitDirection;
    /** @deprecated Ignored — split always creates an empty pane. */
    moveTabId?: string | null;
    /** @deprecated Ignored — split always creates an empty pane. */
    seedTabId?: string;
  },
): CenterPaneLayout {
  if (layout.panes.length >= MAX_CENTER_PANES) return layout;
  void options.moveTabId;
  void options.seedTabId;

  const focused = getFocusedPane(layout);
  const newId = createPaneId(layout.panes.map((p) => p.id));
  const newPane = createEmptyPane(newId);
  const current = normalizeCenterPaneLayout(layout);
  const tree = splitPaneInLayoutTree(
    current.tree ?? focused.id,
    focused.id,
    newId,
    options.direction === "right" ? "row" : "column",
  );

  // Do not prune the new empty pane — empty is the intended post-split state.
  return withCanonicalTabStrip(
    normalizeCenterPaneLayout({
      ...current,
      panes: [...current.panes, newPane],
      tree,
      focusedPaneId: newId,
      columnCount:
        options.direction === "right"
          ? Math.min(MAX_CENTER_PANES, Math.max(current.columnCount, 2))
          : current.columnCount,
    }),
  );
}

export function closePane(layout: CenterPaneLayout, paneId: string): CenterPaneLayout {
  if (layout.panes.length <= 1) return layout;
  // Primary center pane is never closed.
  if (isPrimaryPane(layout, paneId)) return layout;
  const closing = getPane(layout, paneId);
  if (!closing) return layout;

  const remainingPanes = layout.panes.filter((p) => p.id !== paneId);
  const tree = removePaneFromLayoutTree(
    normalizeCenterPaneLayout(layout).tree ?? DEFAULT_PANE_ID,
    paneId,
  );
  const order = tree ? getLeaves(tree) : layout.order.filter((id) => id !== paneId);
  const primaryId = getPrimaryPaneId(layout);
  const neighborId =
    order.includes(primaryId)
      ? primaryId
      : (order[Math.max(0, layout.order.indexOf(paneId) - 1)] ?? order[0]!);

  // Merge closed pane tabs into the neighbor (dedupe, append).
  const panes = remainingPanes.map((p) => {
    if (p.id !== neighborId) return p;
    const merged = [...p.tabIds];
    for (const tabId of closing.tabIds) {
      if (!merged.includes(tabId)) merged.push(tabId);
    }
    return { ...p, tabIds: pinOverviewFront(merged) };
  });

  const focusedPaneId =
    layout.focusedPaneId === paneId ? neighborId : layout.focusedPaneId;

  let columnCount = layout.columnCount;
  if (order.length === 1) columnCount = 1;

  return withCanonicalTabStrip(
    normalizeCenterPaneLayout(
      enforceOverviewPrimaryOnly({
        ...layout,
        panes,
        tree: tree ?? order[0] ?? DEFAULT_PANE_ID,
        order,
        columnCount,
        focusedPaneId,
      }),
    ),
  );
}

export function focusPane(layout: CenterPaneLayout, paneId: string): CenterPaneLayout {
  if (!getPane(layout, paneId) || layout.focusedPaneId === paneId) return layout;
  return { ...layout, focusedPaneId: paneId };
}

/**
 * Activate `tabId` on `paneId` without taking it off sibling panes.
 * Shareable surfaces (Files, editors, Overview) can live in every strip.
 * Live sessions (terminal / browser) stay in the pane that already owns them.
 */
export function setPaneActiveTab(
  layout: CenterPaneLayout,
  paneId: string,
  tabId: string,
): CenterPaneLayout {
  const pane = getPane(layout, paneId);
  if (!pane) return layout;

  if (
    pane.tabIds.includes(tabId) &&
    pane.activeTabId === tabId &&
    layout.focusedPaneId === paneId
  ) {
    return layout;
  }

  const shareable = isShareableCenterTabId(tabId);
  const ownedElsewhere = layout.panes.some(
    (p) => p.id !== paneId && p.tabIds.includes(tabId),
  );
  if (!shareable && ownedElsewhere) {
    return layout.focusedPaneId === paneId ? layout : focusPane(layout, paneId);
  }

  const panes = layout.panes.map((p) => (p.id === paneId ? addTabToPane(p, tabId) : p));
  let next: CenterPaneLayout = {
    ...layout,
    focusedPaneId: paneId,
    panes,
  };
  next = pruneEmptySecondaryPanes(next, layout);
  next = enforceOverviewPrimaryOnly(next);
  return centerPaneLayoutsEqual(layout, next) ? layout : next;
}

function sameStringList(a: readonly string[], b: readonly string[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/** Structural equality for layout writes — must return `layout` when unchanged. */
export function centerPaneLayoutsEqual(a: CenterPaneLayout, b: CenterPaneLayout): boolean {
  if (a === b) return true;
  if (
    a.focusedPaneId !== b.focusedPaneId ||
    a.columnCount !== b.columnCount ||
    Boolean(a.tabStripCanonical) !== Boolean(b.tabStripCanonical) ||
    !sameStringList(a.order, b.order) ||
    !centerPaneTreesEqual(
      a.tree ?? treeFromReadingOrder(a.order, a.columnCount),
      b.tree ?? treeFromReadingOrder(b.order, b.columnCount),
    ) ||
    a.panes.length !== b.panes.length ||
    a.columnFractions.length !== b.columnFractions.length ||
    a.rowFractions.length !== b.rowFractions.length
  ) {
    return false;
  }
  for (let i = 0; i < a.columnFractions.length; i++) {
    if (Math.abs(a.columnFractions[i]! - b.columnFractions[i]!) > 1e-9) return false;
  }
  for (let i = 0; i < a.rowFractions.length; i++) {
    if (Math.abs(a.rowFractions[i]! - b.rowFractions[i]!) > 1e-9) return false;
  }
  for (let i = 0; i < a.panes.length; i++) {
    const pa = a.panes[i]!;
    const pb = b.panes[i]!;
    if (
      pa.id !== pb.id ||
      pa.activeTabId !== pb.activeTabId ||
      !sameStringList(pa.tabIds, pb.tabIds)
    ) {
      return false;
    }
  }
  return true;
}

/**
 * Whether URL/active-tab sync should call {@link openTabOnFocusedPane}.
 * Multi-pane layouts keep ownership isolated: only brand-new tabs (not owned by
 * any pane) attach to the focused pane. Already-owned tabs stay put so split
 * empty launchers and secondary panes do not steal surfaces from each other.
 */
export function shouldAttachActiveTabToFocusedPane(
  layout: CenterPaneLayout,
  tabId: string | null | undefined,
): boolean {
  if (!tabId) return false;
  if (layout.order.length <= 1) return true;
  return !layout.panes.some((pane) => pane.tabIds.includes(tabId));
}

export type CenterTabAttachPlan =
  | { action: "open" }
  | { action: "reveal"; paneId: string };

export type CenterTabAttachPlacement = "reveal" | "focused";

/**
 * Decide whether a tab should attach to the focused pane or jump to the pane
 * that already owns it.
 *
 * Default `reveal` is URL / one-shot chrome: do not copy an already-owned tab
 * onto a split empty launcher. `focused` is an explicit open from that pane
 * (launcher, plus menu, file tree): shareable tabs are copied onto the
 * focused pane; exclusive sessions stay where they are.
 */
export function planCenterTabAttach(
  layout: CenterPaneLayout | null | undefined,
  tabId: string | null | undefined,
  opts?: { placement?: CenterTabAttachPlacement },
): CenterTabAttachPlan {
  if (!tabId) return { action: "open" };
  if (opts?.placement === "focused") return { action: "open" };
  if (!layout || shouldAttachActiveTabToFocusedPane(layout, tabId)) {
    return { action: "open" };
  }
  const paneId = findPaneIdForTab(layout, tabId);
  if (!paneId) return { action: "open" };
  return { action: "reveal", paneId };
}

/** Open or activate a tab on the focused pane without taking it off siblings. */
export function openTabOnFocusedPane(layout: CenterPaneLayout, tabId: string): CenterPaneLayout {
  const focusedId = layout.focusedPaneId;
  const focused = getPane(layout, focusedId);
  if (!focused) return layout;
  if (focused.activeTabId === tabId && focused.tabIds.includes(tabId)) {
    return layout;
  }

  const shareable = isShareableCenterTabId(tabId);
  const ownedElsewhere = layout.panes.some(
    (p) => p.id !== focusedId && p.tabIds.includes(tabId),
  );
  if (!shareable && ownedElsewhere) {
    return layout;
  }

  const panes = layout.panes.map((p) =>
    p.id === focusedId ? addTabToPane(p, tabId) : p,
  );
  let next: CenterPaneLayout = { ...layout, panes, focusedPaneId: focusedId };
  next = pruneEmptySecondaryPanes(next, layout);
  next = enforceOverviewPrimaryOnly(next);
  return centerPaneLayoutsEqual(layout, next) ? layout : next;
}

/** Remove a tab from one pane; sibling strips that also list it are untouched. */
export function removeTabFromPane(
  layout: CenterPaneLayout,
  paneId: string,
  tabId: string,
  preferredNextActiveId?: string | null,
): CenterPaneLayout {
  const pane = getPane(layout, paneId);
  if (!pane) return layout;
  if (!pane.tabIds.includes(tabId) && pane.activeTabId !== tabId) return layout;

  const panes = layout.panes.map((p) => {
    if (p.id !== paneId) return p;
    const tabIds = p.tabIds.filter((id) => id !== tabId);
    if (tabIds.length === 0) return createEmptyPane(p.id);
    return {
      ...p,
      tabIds,
      activeTabId:
        p.activeTabId === tabId
          ? pickReplacementActiveTab(tabIds, preferredNextActiveId)
          : p.activeTabId,
    };
  });

  let next: CenterPaneLayout = { ...layout, panes };
  next = pruneEmptySecondaryPanes(next, layout);
  next = enforceOverviewPrimaryOnly(next);
  return withCanonicalTabStrip(next);
}

/** Remove a tab from whichever pane owns it; auto-close empty secondary panes. */
export function removeTabFromLayout(
  layout: CenterPaneLayout,
  tabId: string,
  preferredNextActiveId?: string | null,
): CenterPaneLayout {
  const primaryId = getPrimaryPaneId(layout);
  let changed = false;
  const panes = layout.panes.map((p) => {
    if (!p.tabIds.includes(tabId) && p.activeTabId !== tabId) return p;
    changed = true;
    const tabIds = p.tabIds.filter((id) => id !== tabId);
    if (tabIds.length === 0) {
      return createEmptyPane(p.id);
    }
    return {
      ...p,
      tabIds,
      activeTabId:
        p.activeTabId === tabId
          ? pickReplacementActiveTab(tabIds, preferredNextActiveId)
          : p.activeTabId,
    };
  });

  if (!changed) return layout;
  let next: CenterPaneLayout = { ...layout, panes };
  next = pruneEmptySecondaryPanes(next, layout);
  next = enforceOverviewPrimaryOnly(next);
  return withCanonicalTabStrip(next);
}

/**
 * Ensure every tab in `openTabIds` lives in some pane; drop ownership of tabs
 * no longer open. New tabs attach to the focused pane.
 * Returns the same `layout` reference when nothing changed.
 */
export function reconcileOpenTabs(
  layout: CenterPaneLayout,
  openTabIds: string[],
  preferredActiveTabId?: string | null,
): CenterPaneLayout {
  const open = new Set(openTabIds);
  if (open.size === 0 && preferredActiveTabId) {
    open.add(preferredActiveTabId);
  }

  const primaryId = getPrimaryPaneId(layout);
  const ownedByOtherPane = (paneId: string, tabId: string) =>
    layout.panes.some((other) => other.id !== paneId && other.tabIds.includes(tabId));
  // Split intentionally leaves empty launcher panes — keep those.
  const intentionallyEmpty = new Set(
    layout.panes.filter((p) => p.tabIds.length === 0).map((p) => p.id),
  );

  // Strip closed tabs. Overview may live on any pane.
  let panes = layout.panes.map((p) => {
    if (intentionallyEmpty.has(p.id) && p.id !== primaryId) {
      return createEmptyPane(p.id);
    }
    const tabIds = pinOverviewFront(p.tabIds.filter((id) => open.has(id)));
    if (tabIds.length === 0) {
      if (p.id === primaryId) {
        const unownedPreferred =
          preferredActiveTabId &&
          open.has(preferredActiveTabId) &&
          preferredActiveTabId !== OVERVIEW_TAB_ID &&
          !ownedByOtherPane(p.id, preferredActiveTabId)
            ? preferredActiveTabId
            : null;
        if (intentionallyEmpty.has(p.id) || p.tabIds.length === 0) {
          if (!unownedPreferred) return createEmptyPane(p.id);
          return { ...p, tabIds: [unownedPreferred], activeTabId: unownedPreferred };
        }
        const fallback =
          unownedPreferred ??
          (open.has(OVERVIEW_TAB_ID) ? OVERVIEW_TAB_ID : null) ??
          [...open].find((id) => !ownedByOtherPane(p.id, id)) ??
          null;
        if (!fallback) return createEmptyPane(p.id);
        const nextIds = fallback === OVERVIEW_TAB_ID ? [OVERVIEW_TAB_ID] : [fallback];
        if (p.tabIds.length === 1 && p.tabIds[0] === fallback && p.activeTabId === fallback) {
          return p;
        }
        return { ...p, tabIds: nextIds, activeTabId: fallback };
      }
      // Became empty because owned tabs closed — mark for prune.
      return createEmptyPane(p.id);
    }
    const nextActive = tabIds.includes(p.activeTabId)
      ? p.activeTabId
      : pickReplacementActiveTab(tabIds, preferredActiveTabId);
    if (sameStringList(p.tabIds, tabIds) && p.activeTabId === nextActive) return p;
    return {
      ...p,
      tabIds,
      activeTabId: nextActive,
    };
  });

  const owned = new Set(panes.flatMap((p) => p.tabIds));
  const missing = openTabIds.filter((id) => !owned.has(id));
  if (missing.length > 0) {
    const targetId = layout.focusedPaneId;
    panes = panes.map((p) => {
      if (p.id !== targetId) return p;
      const extra = missing.filter((id) => !p.tabIds.includes(id));
      if (extra.length === 0) return p;
      const nextActive =
        preferredActiveTabId && missing.includes(preferredActiveTabId)
          ? preferredActiveTabId
          : p.activeTabId || extra[0]!;
      return {
        ...p,
        tabIds: pinOverviewFront([...p.tabIds, ...extra]),
        activeTabId: nextActive,
      };
    });
  }

  let next: CenterPaneLayout = { ...layout, panes };
  // Only prune secondaries that became empty (had tabs before this reconcile).
  for (const pane of panes) {
    if (pane.id === primaryId) continue;
    if (pane.tabIds.length === 0 && !intentionallyEmpty.has(pane.id)) {
      next = closePane(next, pane.id);
    }
  }
  next = enforceOverviewPrimaryOnly(next);
  return centerPaneLayoutsEqual(layout, next) ? layout : next;
}

export function gridTemplateStyles(layout: CenterPaneLayout): {
  gridTemplateColumns: string;
  gridTemplateRows: string;
} {
  const synced = syncFractionsToPaneCount(layout);
  return {
    gridTemplateColumns: synced.columnFractions.map((f) => `${f}fr`).join(" "),
    gridTemplateRows: synced.rowFractions.map((f) => `${f}fr`).join(" "),
  };
}
