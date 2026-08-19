import {
  findPaneIdForTab,
  getPane,
  getPrimaryPaneId,
  OVERVIEW_TAB_ID,
  type CenterPaneLayout,
} from "@/app-shell/center-pane/center-pane-layout";

export type CloseFallbackResult = {
  /** Tab to show in URL/chrome after close. Null = leave chrome unchanged. */
  nextTabId: string | null;
  /**
   * Close fallback must never call exclusive `openTab`. Sibling panes keep
   * their tabs even when chrome moves to a neighbor after a pane collapses.
   */
  attachToFocusedPane: false;
};

/**
 * Pick the next chrome tab after closing, restricted to the pane that owned
 * the closed tab(s). Never returns a tab that still belongs to a sibling pane
 * unless that sibling is the only remaining pane after this close.
 */
export function resolvePaneLocalCloseFallback(input: {
  layoutBefore: CenterPaneLayout | null | undefined;
  closedTabIds: readonly string[];
  activeTabId: string;
  openTabValues: ReadonlySet<string>;
  mruOrder: readonly string[];
  fallbackTab: string;
}): CloseFallbackResult {
  const noAttach = { attachToFocusedPane: false as const };
  const closed = input.closedTabIds.filter(Boolean);
  if (closed.length === 0) {
    return { nextTabId: null, ...noAttach };
  }

  const layout = input.layoutBefore;
  const activeWasClosed = closed.includes(input.activeTabId);

  if (!layout || layout.order.length <= 1) {
    if (!activeWasClosed) {
      return { nextTabId: null, ...noAttach };
    }
    const next =
      pickMruAmong(input.mruOrder, input.openTabValues) ??
      (input.openTabValues.has(input.fallbackTab) ? input.fallbackTab : null) ??
      firstOpen(input.openTabValues);
    return { nextTabId: next, ...noAttach };
  }

  const owningPaneId =
    (activeWasClosed ? findPaneIdForTab(layout, input.activeTabId) : null) ??
    firstOwningPaneId(layout, closed) ??
    layout.focusedPaneId;
  const owning = getPane(layout, owningPaneId);
  const remaining = (owning?.tabIds ?? []).filter(
    (id) => !closed.includes(id) && input.openTabValues.has(id),
  );

  if (remaining.length > 0) {
    if (!activeWasClosed && owning && !closed.includes(owning.activeTabId)) {
      return { nextTabId: null, ...noAttach };
    }
    const next =
      pickMruAmong(input.mruOrder, new Set(remaining)) ?? remaining[0]!;
    return { nextTabId: next, ...noAttach };
  }

  if (!activeWasClosed) {
    return { nextTabId: null, ...noAttach };
  }

  const primaryId = getPrimaryPaneId(layout);
  if (owningPaneId === primaryId) {
    const next =
      (input.openTabValues.has(OVERVIEW_TAB_ID) ? OVERVIEW_TAB_ID : null) ??
      (input.openTabValues.has(input.fallbackTab) ? input.fallbackTab : null) ??
      firstOpen(input.openTabValues);
    return { nextTabId: next, ...noAttach };
  }

  const neighbor = layout.panes.find(
    (pane) => pane.id !== owningPaneId && pane.tabIds.some((id) => !closed.includes(id)),
  );
  const neighborActive =
    neighbor && !closed.includes(neighbor.activeTabId) ? neighbor.activeTabId : null;
  const next =
    (neighborActive && input.openTabValues.has(neighborActive) ? neighborActive : null) ??
    (neighbor?.tabIds.find((id) => !closed.includes(id) && input.openTabValues.has(id)) ??
      null);
  return { nextTabId: next, ...noAttach };
}

function firstOwningPaneId(
  layout: CenterPaneLayout,
  closedTabIds: readonly string[],
): string | null {
  for (const tabId of closedTabIds) {
    const paneId = findPaneIdForTab(layout, tabId);
    if (paneId) return paneId;
  }
  return null;
}

function pickMruAmong(
  mruOrder: readonly string[],
  allowed: ReadonlySet<string>,
): string | null {
  for (const id of mruOrder) {
    if (allowed.has(id)) return id;
  }
  return null;
}

function firstOpen(openTabValues: ReadonlySet<string>): string | null {
  for (const id of openTabValues) return id;
  return null;
}
