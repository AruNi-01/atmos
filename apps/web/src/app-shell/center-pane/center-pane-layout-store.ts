"use client";

import { create } from "zustand";
import { readJson, writeJson } from "@/shared/lib/browser-store";
import {
  applyCenterPaneTree,
  centerPaneLayoutsEqual,
  closePane,
  createDefaultLayout,
  createEmptyCenterLayout,
  isFreshEmptyCenterLayout,
  focusPane,
  migrateLegacySinglePaneStripOrder,
  normalizeCenterPaneLayout,
  openTabOnFocusedPane,
  withCanonicalTabStrip,
  reorderPaneTabIds,
  reorderPanes,
  resizeAdjacentFractions,
  setColumnCount,
  setPaneActiveTab,
  splitPane,
  syncFractionsToPaneCount,
  type CenterPaneLayout,
  type CenterPaneTree,
  type SplitDirection,
  reconcileOpenTabs,
  removeTabFromLayout,
  removeTabFromPane as dropTabFromPane,
  MAX_CENTER_PANES,
} from "@/app-shell/center-pane/center-pane-layout";
import { isExtraCenterSpaceKey } from "@/app-shell/center-space/center-space";

const STORAGE_KEY = "atmos.center-pane-layout.v1";
const MAX_CONTEXTS = 24;

type LayoutByContext = Record<string, CenterPaneLayout>;

type CenterPaneLayoutStore = {
  byContext: LayoutByContext;
  hydrated: boolean;
  hydrate: () => void;
  getLayout: (contextId: string) => CenterPaneLayout | null;
  ensureLayout: (
    contextId: string,
    openTabIds: string[],
    activeTabId: string,
    legacyStripOrder?: readonly string[],
  ) => CenterPaneLayout;
  setLayout: (contextId: string, layout: CenterPaneLayout) => void;
  patchLayout: (
    contextId: string,
    updater: (layout: CenterPaneLayout) => CenterPaneLayout,
  ) => void;
  focus: (contextId: string, paneId: string) => void;
  split: (
    contextId: string,
    direction: SplitDirection,
    opts?: { moveTabId?: string | null; seedTabId?: string },
  ) => void;
  close: (contextId: string, paneId: string) => void;
  reorder: (contextId: string, fromIndex: number, toIndex: number) => void;
  reorderTabs: (contextId: string, paneId: string, orderedTabIds: readonly string[]) => void;
  resizeColumns: (contextId: string, boundaryIndex: number, delta: number) => void;
  resizeRows: (contextId: string, boundaryIndex: number, delta: number) => void;
  setActiveTab: (contextId: string, paneId: string, tabId: string) => void;
  openTab: (contextId: string, tabId: string) => void;
  removeTab: (
    contextId: string,
    tabId: string,
    preferredNextActiveId?: string | null,
  ) => void;
  removeTabFromPane: (
    contextId: string,
    paneId: string,
    tabId: string,
    preferredNextActiveId?: string | null,
  ) => void;
  reconcile: (
    contextId: string,
    openTabIds: string[],
    preferredActiveTabId?: string | null,
  ) => void;
  setColumns: (contextId: string, columnCount: number) => void;
  setTree: (contextId: string, tree: CenterPaneTree) => void;
  /** Drop a context's mosaic (used when deleting a center space). */
  forgetContext: (contextId: string) => void;
};

function persist(byContext: LayoutByContext) {
  const keys = Object.keys(byContext);
  if (keys.length <= MAX_CONTEXTS) {
    writeJson(STORAGE_KEY, byContext);
    return;
  }
  // Drop oldest arbitrary overflow (object key order is insertion order).
  const trimmed: LayoutByContext = {};
  for (const key of keys.slice(keys.length - MAX_CONTEXTS)) {
    trimmed[key] = byContext[key]!;
  }
  writeJson(STORAGE_KEY, trimmed);
}

function readStored(): LayoutByContext {
  const raw = readJson<LayoutByContext | null>(STORAGE_KEY, null);
  if (!raw || typeof raw !== "object") return {};
  const next: LayoutByContext = {};
  for (const [contextId, layout] of Object.entries(raw)) {
    if (!layout || typeof layout !== "object" || !Array.isArray(layout.panes)) continue;
    next[contextId] = normalizeCenterPaneLayout(layout);
  }
  return next;
}

export const useCenterPaneLayoutStore = create<CenterPaneLayoutStore>((set, get) => ({
  byContext: {},
  hydrated: false,

  hydrate: () => {
    if (get().hydrated) return;
    set({ byContext: readStored(), hydrated: true });
  },

  getLayout: (contextId) => {
    if (!contextId) return null;
    return get().byContext[contextId] ?? null;
  },

  ensureLayout: (contextId, openTabIds, activeTabId, legacyStripOrder = []) => {
    if (!contextId) {
      return withCanonicalTabStrip(createDefaultLayout(openTabIds, activeTabId));
    }
    const existing = get().byContext[contextId];
    if (isExtraCenterSpaceKey(contextId)) {
      const empty = existing
        ? normalizeCenterPaneLayout(existing)
        : createEmptyCenterLayout();
      if (!existing || isFreshEmptyCenterLayout(empty)) {
        if (!existing) get().setLayout(contextId, empty);
        return get().byContext[contextId] ?? empty;
      }
    }
    if (existing && isFreshEmptyCenterLayout(normalizeCenterPaneLayout(existing))) {
      return normalizeCenterPaneLayout(existing);
    }
    if (existing) {
      const reconciled = reconcileOpenTabs(
        normalizeCenterPaneLayout(existing),
        openTabIds,
        activeTabId,
      );
      const migrated = migrateLegacySinglePaneStripOrder(
        reconciled,
        legacyStripOrder,
      );
      if (!centerPaneLayoutsEqual(existing, migrated)) {
        get().setLayout(contextId, migrated);
      }
      return get().byContext[contextId] ?? migrated;
    }
    const layout = withCanonicalTabStrip(
      createDefaultLayout(openTabIds, activeTabId),
    );
    get().setLayout(contextId, layout);
    return layout;
  },

  setLayout: (contextId, layout) => {
    if (!contextId) return;
    const synced = normalizeCenterPaneLayout(syncFractionsToPaneCount(layout));
    const prev = get().byContext[contextId];
    if (prev && centerPaneLayoutsEqual(prev, synced)) {
      return;
    }
    set((state) => {
      const byContext = { ...state.byContext, [contextId]: synced };
      persist(byContext);
      return { byContext, hydrated: true };
    });
  },

  patchLayout: (contextId, updater) => {
    const current =
      get().byContext[contextId] ??
      (isExtraCenterSpaceKey(contextId)
        ? createEmptyCenterLayout()
        : createDefaultLayout(["terminal"], "terminal"));
    const next = updater(current);
    if (next === current || centerPaneLayoutsEqual(current, next)) {
      return;
    }
    get().setLayout(contextId, next);
  },

  focus: (contextId, paneId) => {
    get().patchLayout(contextId, (layout) => focusPane(layout, paneId));
  },

  split: (contextId, direction, opts) => {
    get().patchLayout(contextId, (layout) => {
      if (layout.panes.length >= MAX_CENTER_PANES) return layout;
      return splitPane(layout, {
        direction,
        moveTabId: opts?.moveTabId,
        seedTabId: opts?.seedTabId,
      });
    });
  },

  close: (contextId, paneId) => {
    get().patchLayout(contextId, (layout) => closePane(layout, paneId));
  },

  reorder: (contextId, fromIndex, toIndex) => {
    get().patchLayout(contextId, (layout) => reorderPanes(layout, fromIndex, toIndex));
  },

  reorderTabs: (contextId, paneId, orderedTabIds) => {
    get().patchLayout(contextId, (layout) =>
      reorderPaneTabIds(layout, paneId, orderedTabIds),
    );
  },

  resizeColumns: (contextId, boundaryIndex, delta) => {
    get().patchLayout(contextId, (layout) => ({
      ...layout,
      columnFractions: resizeAdjacentFractions(
        layout.columnFractions,
        boundaryIndex,
        delta,
      ),
    }));
  },

  resizeRows: (contextId, boundaryIndex, delta) => {
    get().patchLayout(contextId, (layout) => ({
      ...layout,
      rowFractions: resizeAdjacentFractions(layout.rowFractions, boundaryIndex, delta),
    }));
  },

  setActiveTab: (contextId, paneId, tabId) => {
    get().patchLayout(contextId, (layout) => setPaneActiveTab(layout, paneId, tabId));
  },

  openTab: (contextId, tabId) => {
    get().patchLayout(contextId, (layout) => openTabOnFocusedPane(layout, tabId));
  },

  removeTab: (contextId, tabId, preferredNextActiveId) => {
    get().patchLayout(contextId, (layout) =>
      removeTabFromLayout(layout, tabId, preferredNextActiveId),
    );
  },

  removeTabFromPane: (contextId, paneId, tabId, preferredNextActiveId) => {
    get().patchLayout(contextId, (layout) =>
      dropTabFromPane(layout, paneId, tabId, preferredNextActiveId),
    );
  },

  reconcile: (contextId, openTabIds, preferredActiveTabId) => {
    get().patchLayout(contextId, (layout) =>
      reconcileOpenTabs(layout, openTabIds, preferredActiveTabId),
    );
  },

  setColumns: (contextId, columnCount) => {
    get().patchLayout(contextId, (layout) => setColumnCount(layout, columnCount));
  },

  setTree: (contextId, tree) => {
    get().patchLayout(contextId, (layout) => applyCenterPaneTree(layout, tree));
  },

  forgetContext: (contextId) => {
    if (!contextId) return;
    const current = get().byContext;
    if (!(contextId in current)) return;
    const byContext = { ...current };
    delete byContext[contextId];
    persist(byContext);
    set({ byContext, hydrated: true });
  },
}));
