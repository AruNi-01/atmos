"use client";

import { create } from "zustand";
import { readJson, writeJson } from "@/shared/lib/browser-store";
import {
  centerPaneLayoutsEqual,
  closePane,
  createDefaultLayout,
  focusPane,
  openTabOnFocusedPane,
  reorderPanes,
  resizeAdjacentFractions,
  setColumnCount,
  setPaneActiveTab,
  splitPane,
  syncFractionsToPaneCount,
  type CenterPaneLayout,
  type SplitDirection,
  reconcileOpenTabs,
  removeTabFromLayout,
  MAX_CENTER_PANES,
} from "@/app-shell/center-pane/center-pane-layout";

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
  resizeColumns: (contextId: string, boundaryIndex: number, delta: number) => void;
  resizeRows: (contextId: string, boundaryIndex: number, delta: number) => void;
  setActiveTab: (contextId: string, paneId: string, tabId: string) => void;
  openTab: (contextId: string, tabId: string) => void;
  removeTab: (contextId: string, tabId: string) => void;
  reconcile: (
    contextId: string,
    openTabIds: string[],
    preferredActiveTabId?: string | null,
  ) => void;
  setColumns: (contextId: string, columnCount: number) => void;
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
  return raw;
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

  ensureLayout: (contextId, openTabIds, activeTabId) => {
    if (!contextId) return createDefaultLayout(openTabIds, activeTabId);
    const existing = get().byContext[contextId];
    if (existing) {
      const reconciled = reconcileOpenTabs(existing, openTabIds, activeTabId);
      if (reconciled !== existing) {
        get().setLayout(contextId, reconciled);
      }
      return get().byContext[contextId] ?? reconciled;
    }
    const layout = createDefaultLayout(openTabIds, activeTabId);
    get().setLayout(contextId, layout);
    return layout;
  },

  setLayout: (contextId, layout) => {
    if (!contextId) return;
    const synced = syncFractionsToPaneCount(layout);
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
      get().byContext[contextId] ?? createDefaultLayout(["terminal"], "terminal");
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

  removeTab: (contextId, tabId) => {
    get().patchLayout(contextId, (layout) => removeTabFromLayout(layout, tabId));
  },

  reconcile: (contextId, openTabIds, preferredActiveTabId) => {
    get().patchLayout(contextId, (layout) =>
      reconcileOpenTabs(layout, openTabIds, preferredActiveTabId),
    );
  },

  setColumns: (contextId, columnCount) => {
    get().patchLayout(contextId, (layout) => setColumnCount(layout, columnCount));
  },
}));
