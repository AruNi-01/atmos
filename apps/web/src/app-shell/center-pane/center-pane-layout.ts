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
/** Overview is only allowed on the primary (first) center pane. */
export const OVERVIEW_TAB_ID = "overview";
export const FALLBACK_SECONDARY_TAB_ID = "terminal";
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

function stripOverviewFromTabIds(tabIds: string[]): string[] {
  return tabIds.filter((id) => id !== OVERVIEW_TAB_ID);
}

function pickNonOverviewTab(tabIds: readonly string[], preferred?: string | null): string | null {
  if (preferred && preferred !== OVERVIEW_TAB_ID && tabIds.includes(preferred)) {
    return preferred;
  }
  return tabIds.find((id) => id !== OVERVIEW_TAB_ID) ?? null;
}

/**
 * Move Overview onto primary only; strip it from every other pane.
 * Empty secondary panes are kept (launcher empty state) — they are only closed
 * when the last tab is removed via {@link removeTabFromLayout}.
 */
export function enforceOverviewPrimaryOnly(layout: CenterPaneLayout): CenterPaneLayout {
  const primaryId = getPrimaryPaneId(layout);
  let panes = layout.panes.map((p) => {
    if (p.id === primaryId) {
      // Primary may keep overview.
      return p;
    }
    if (!p.tabIds.includes(OVERVIEW_TAB_ID) && p.activeTabId !== OVERVIEW_TAB_ID) {
      return p;
    }
    const tabIds = stripOverviewFromTabIds(p.tabIds);
    if (tabIds.length === 0) {
      return createEmptyPane(p.id);
    }
    const activeTabId =
      p.activeTabId === OVERVIEW_TAB_ID || !tabIds.includes(p.activeTabId)
        ? tabIds[0]!
        : p.activeTabId;
    return { ...p, tabIds, activeTabId };
  });

  // Ensure primary owns overview when any pane had it (or it was active somewhere).
  const overviewWasPresent = layout.panes.some(
    (p) => p.tabIds.includes(OVERVIEW_TAB_ID) || p.activeTabId === OVERVIEW_TAB_ID,
  );
  if (overviewWasPresent) {
    panes = panes.map((p) => {
      if (p.id !== primaryId) return p;
      const tabIds = p.tabIds.includes(OVERVIEW_TAB_ID)
        ? p.tabIds
        : [...p.tabIds, OVERVIEW_TAB_ID];
      return p.tabIds === tabIds ? p : { ...p, tabIds };
    });
  }

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
  for (const pane of layout.panes) {
    if (pane.tabIds.includes(tabId) || pane.activeTabId === tabId) {
      return pane.id;
    }
  }
  return null;
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
  return normalizeCenterPaneLayout({
    ...current,
    panes: [...current.panes, newPane],
    tree,
    focusedPaneId: newId,
    columnCount:
      options.direction === "right"
        ? Math.min(MAX_CENTER_PANES, Math.max(current.columnCount, 2))
        : current.columnCount,
  });
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

  // Merge closed pane tabs into primary/neighbor (dedupe, append). Overview stays primary-only.
  const panes = remainingPanes.map((p) => {
    if (p.id !== neighborId) return p;
    const merged = [...p.tabIds];
    for (const tabId of closing.tabIds) {
      if (tabId === OVERVIEW_TAB_ID && p.id !== primaryId) continue;
      if (!merged.includes(tabId)) merged.push(tabId);
    }
    return { ...p, tabIds: merged };
  });

  const focusedPaneId =
    layout.focusedPaneId === paneId ? neighborId : layout.focusedPaneId;

  let columnCount = layout.columnCount;
  if (order.length === 1) columnCount = 1;

  return normalizeCenterPaneLayout(
    enforceOverviewPrimaryOnly({
      ...layout,
      panes,
      tree: tree ?? order[0] ?? DEFAULT_PANE_ID,
      order,
      columnCount,
      focusedPaneId,
    }),
  );
}

export function focusPane(layout: CenterPaneLayout, paneId: string): CenterPaneLayout {
  if (!getPane(layout, paneId) || layout.focusedPaneId === paneId) return layout;
  return { ...layout, focusedPaneId: paneId };
}

/**
 * Activate `tabId` on `paneId` with **exclusive** ownership: remove it from every
 * other pane so multi-pane layouts stay isolated (one surface → one pane).
 */
export function setPaneActiveTab(
  layout: CenterPaneLayout,
  paneId: string,
  tabId: string,
): CenterPaneLayout {
  // Overview can only be activated on the primary pane.
  const primaryId = getPrimaryPaneId(layout);
  const targetPaneId = tabId === OVERVIEW_TAB_ID ? primaryId : paneId;
  const pane = getPane(layout, targetPaneId);
  if (!pane) return layout;
  if (tabId === OVERVIEW_TAB_ID && !isPrimaryPane(layout, targetPaneId)) {
    return layout;
  }

  const ownedOnlyHere =
    pane.tabIds.includes(tabId) &&
    pane.activeTabId === tabId &&
    layout.focusedPaneId === targetPaneId &&
    !layout.panes.some((p) => p.id !== targetPaneId && p.tabIds.includes(tabId));
  if (ownedOnlyHere) return layout;

  const panes = layout.panes.map((p) => {
    if (p.id === targetPaneId) {
      const tabIds = p.tabIds.includes(tabId) ? p.tabIds : [...p.tabIds, tabId];
      if (p.activeTabId === tabId && sameStringList(p.tabIds, tabIds)) return p;
      return { ...p, tabIds, activeTabId: tabId };
    }
    if (!p.tabIds.includes(tabId)) return p;
    const tabIds = p.tabIds.filter((id) => id !== tabId);
    if (tabIds.length === 0) {
      if (p.id === primaryId) {
        return { ...p, tabIds: [OVERVIEW_TAB_ID], activeTabId: OVERVIEW_TAB_ID };
      }
      return createEmptyPane(p.id);
    }
    return {
      ...p,
      tabIds,
      activeTabId: p.activeTabId === tabId ? tabIds[0]! : p.activeTabId,
    };
  });

  let next: CenterPaneLayout = {
    ...layout,
    focusedPaneId: targetPaneId,
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

/** Open or activate a tab on the focused pane; remove from any other pane. */
export function openTabOnFocusedPane(layout: CenterPaneLayout, tabId: string): CenterPaneLayout {
  // Overview always lands on the primary pane.
  const focusedId =
    tabId === OVERVIEW_TAB_ID ? getPrimaryPaneId(layout) : layout.focusedPaneId;
  const focused = getPane(layout, focusedId);
  // Fast path: already active only on focused pane, nowhere else owns it.
  if (focused && focused.activeTabId === tabId && focused.tabIds.includes(tabId)) {
    const ownedElsewhere = layout.panes.some(
      (p) => p.id !== focusedId && p.tabIds.includes(tabId),
    );
    if (!ownedElsewhere) return layout;
  }

  const primaryId = getPrimaryPaneId(layout);
  const panes = layout.panes.map((p) => {
    if (p.id === focusedId) {
      // Secondary panes must never own Overview.
      if (tabId === OVERVIEW_TAB_ID && p.id !== primaryId) return p;
      const tabIds = p.tabIds.includes(tabId) ? p.tabIds : [...p.tabIds, tabId];
      if (p.activeTabId === tabId && sameStringList(p.tabIds, tabIds)) return p;
      return { ...p, tabIds, activeTabId: tabId };
    }
    if (!p.tabIds.includes(tabId)) return p;
    const tabIds = p.tabIds.filter((id) => id !== tabId);
    if (tabIds.length === 0) {
      // Empty secondary → mark empty (pruned below). Primary falls back to overview.
      if (p.id === primaryId) {
        return { ...p, tabIds: [OVERVIEW_TAB_ID], activeTabId: OVERVIEW_TAB_ID };
      }
      return createEmptyPane(p.id);
    }
    return {
      ...p,
      tabIds,
      activeTabId: p.activeTabId === tabId ? tabIds[0]! : p.activeTabId,
    };
  });

  let next: CenterPaneLayout = { ...layout, panes, focusedPaneId: focusedId };
  next = pruneEmptySecondaryPanes(next, layout);
  next = enforceOverviewPrimaryOnly(next);
  return centerPaneLayoutsEqual(layout, next) ? layout : next;
}

/** Remove a tab from whichever pane owns it; auto-close empty secondary panes. */
export function removeTabFromLayout(layout: CenterPaneLayout, tabId: string): CenterPaneLayout {
  const primaryId = getPrimaryPaneId(layout);
  let changed = false;
  const panes = layout.panes.map((p) => {
    if (!p.tabIds.includes(tabId) && p.activeTabId !== tabId) return p;
    changed = true;
    const tabIds = p.tabIds.filter((id) => id !== tabId);
    if (tabIds.length === 0) {
      if (p.id === primaryId) {
        // Primary never closes; keep Overview as the residual surface.
        return {
          ...p,
          tabIds: [OVERVIEW_TAB_ID],
          activeTabId: OVERVIEW_TAB_ID,
        };
      }
      // Secondary becomes empty after last tab closed → prune.
      return createEmptyPane(p.id);
    }
    return {
      ...p,
      tabIds,
      activeTabId: p.activeTabId === tabId ? tabIds[0]! : p.activeTabId,
    };
  });

  if (!changed) return layout;
  let next: CenterPaneLayout = { ...layout, panes };
  next = pruneEmptySecondaryPanes(next, layout);
  next = enforceOverviewPrimaryOnly(next);
  return next;
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
  if (open.size === 0) {
    open.add("terminal");
  }

  const primaryId = getPrimaryPaneId(layout);
  // Split intentionally leaves empty launcher panes — keep those.
  const intentionallyEmpty = new Set(
    layout.panes.filter((p) => p.tabIds.length === 0).map((p) => p.id),
  );

  // Strip closed tabs; Overview never stays on secondary panes.
  let panes = layout.panes.map((p) => {
    if (intentionallyEmpty.has(p.id) && p.id !== primaryId) {
      return createEmptyPane(p.id);
    }
    let tabIds = p.tabIds.filter((id) => open.has(id));
    if (p.id !== primaryId) {
      tabIds = stripOverviewFromTabIds(tabIds);
    }
    if (tabIds.length === 0) {
      if (p.id === primaryId) {
        const fallback =
          preferredActiveTabId &&
          open.has(preferredActiveTabId) &&
          preferredActiveTabId !== OVERVIEW_TAB_ID
            ? preferredActiveTabId
            : open.has(OVERVIEW_TAB_ID)
              ? OVERVIEW_TAB_ID
              : ([...open][0] ?? OVERVIEW_TAB_ID);
        if (p.tabIds.length === 1 && p.tabIds[0] === fallback && p.activeTabId === fallback) {
          return p;
        }
        return { ...p, tabIds: [fallback], activeTabId: fallback };
      }
      // Became empty because owned tabs closed — mark for prune.
      return createEmptyPane(p.id);
    }
    const nextActive = tabIds.includes(p.activeTabId) ? p.activeTabId : tabIds[0]!;
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
    const targetId =
      preferredActiveTabId === OVERVIEW_TAB_ID ||
      (missing.includes(OVERVIEW_TAB_ID) && layout.focusedPaneId !== primaryId)
        ? primaryId
        : layout.focusedPaneId;
    panes = panes.map((p) => {
      if (p.id !== targetId) return p;
      const extra = missing.filter((id) => {
        if (p.tabIds.includes(id)) return false;
        // Secondary panes cannot receive Overview.
        if (id === OVERVIEW_TAB_ID && p.id !== primaryId) return false;
        return true;
      });
      if (extra.length === 0) return p;
      const nextActive =
        preferredActiveTabId && missing.includes(preferredActiveTabId)
          ? preferredActiveTabId === OVERVIEW_TAB_ID && p.id !== primaryId
            ? p.activeTabId || extra[0]!
            : preferredActiveTabId
          : p.activeTabId || extra[0]!;
      return {
        ...p,
        tabIds: [...p.tabIds, ...extra],
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
