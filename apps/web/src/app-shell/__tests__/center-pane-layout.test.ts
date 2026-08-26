import { describe, expect, it } from "bun:test";
import {
  closePane,
  collectActiveTabIds,
  createDefaultLayout,
  createEmptyCenterLayout,
  DEFAULT_PANE_ID,
  isFreshEmptyCenterLayout,
  findPaneIdForTab,
  focusPane,
  getPane,
  isEmptyPane,
  isPrimaryPane,
  MAX_CENTER_PANES,
  normalizeCenterPaneLayout,
  openTabOnFocusedPane,
  OVERVIEW_TAB_ID,
  reconcileOpenTabs,
  removeTabFromLayout,
  reorderPanes,
  resizeAdjacentFractions,
  rowCountFor,
  setLayoutFullscreenPane,
  setPaneActiveTab,
  isShareableCenterTabId,
  planCenterTabAttach,
  removeTabFromPane,
  shouldAttachActiveTabToFocusedPane,
  splitPane,
  syncFractionsToPaneCount,
  treeFromReadingOrder,
  MIN_FRACTION,
} from "@/app-shell/center-pane/center-pane-layout";
import { collectTerminalLayoutGeometry, getLeaves } from "@/features/terminal/lib/terminal-layout-tree";

describe("center-pane-layout", () => {
  it("creates a fresh empty extra-space layout with no inherited tabs", () => {
    const layout = createEmptyCenterLayout();
    expect(isFreshEmptyCenterLayout(layout)).toBe(true);
    expect(layout.panes).toHaveLength(1);
    expect(layout.panes[0]!.tabIds).toEqual([]);
    expect(layout.panes[0]!.activeTabId).toBe("");
  });

  it("creates a single-pane default owning all tabs", () => {
    const layout = createDefaultLayout(["terminal", "overview", "a.ts"], "a.ts");
    expect(layout.panes).toHaveLength(1);
    expect(layout.order).toEqual(["pane-main"]);
    expect(layout.panes[0]!.tabIds).toEqual(["terminal", "overview", "a.ts"]);
    expect(layout.panes[0]!.activeTabId).toBe("a.ts");
    expect(layout.columnCount).toBe(1);
  });

  it("splits right into an empty secondary pane without moving tabs", () => {
    const base = createDefaultLayout(
      ["terminal", "overview", "files", "wiki"],
      "files",
    );
    const next = splitPane(base, { direction: "right", seedTabId: "files" });
    expect(next.panes).toHaveLength(2);
    expect(next.columnCount).toBeGreaterThanOrEqual(2);
    const primary = next.panes.find((p) => p.id === DEFAULT_PANE_ID)!;
    expect(primary.tabIds).toEqual(["terminal", "overview", "files", "wiki"]);
    expect(primary.activeTabId).toBe("files");
    const secondaryId = next.order.find((id) => id !== DEFAULT_PANE_ID)!;
    const secondary = next.panes.find((p) => p.id === secondaryId)!;
    expect(isEmptyPane(secondary)).toBe(true);
    expect(secondary.tabIds).toEqual([]);
    expect(next.focusedPaneId).toBe(secondaryId);
    // URL still points at primary's active tab — must NOT re-attach / steal it
    // onto the new empty secondary (that would couple the two panes).
    expect(shouldAttachActiveTabToFocusedPane(next, "files")).toBe(false);
    expect(shouldAttachActiveTabToFocusedPane(next, "brand-new-tab")).toBe(true);
  });

  it("single-pane always attaches the active URL tab", () => {
    const layout = createDefaultLayout(["terminal", "overview"], "terminal");
    expect(shouldAttachActiveTabToFocusedPane(layout, "terminal")).toBe(true);
    expect(shouldAttachActiveTabToFocusedPane(layout, "overview")).toBe(true);
    expect(planCenterTabAttach(layout, "terminal")).toEqual({ action: "open" });
  });

  it("reveals an already-owned tab instead of stealing it onto the focused pane", () => {
    const next = splitPane(
      createDefaultLayout(["terminal", "overview", "files"], "files"),
      { direction: "right", seedTabId: "files" },
    );
    const primaryId = next.panes.find((pane) => pane.id === DEFAULT_PANE_ID)!.id;
    expect(planCenterTabAttach(next, "files")).toEqual({
      action: "reveal",
      paneId: primaryId,
    });
    expect(planCenterTabAttach(next, "brand-new-tab")).toEqual({ action: "open" });
  });

  it("opens on the focused pane when placement is focused even if a sibling owns the tab", () => {
    let layout = createDefaultLayout(["files", "terminal"], "files");
    layout = splitPane(layout, { direction: "right" });
    layout = splitPane(layout, { direction: "down" });
    expect(layout.panes).toHaveLength(3);
    expect(planCenterTabAttach(layout, "files")).toEqual({
      action: "reveal",
      paneId: DEFAULT_PANE_ID,
    });
    expect(planCenterTabAttach(layout, "files", { placement: "focused" })).toEqual({
      action: "open",
    });

    const opened = openTabOnFocusedPane(layout, "files");
    expect(getPane(opened, layout.focusedPaneId)!.tabIds).toContain("files");
    expect(getPane(opened, layout.focusedPaneId)!.activeTabId).toBe("files");
    expect(getPane(opened, DEFAULT_PANE_ID)!.tabIds).toContain("files");
  });

  it("does not clone a live terminal session onto another pane", () => {
    expect(isShareableCenterTabId("files")).toBe(true);
    expect(isShareableCenterTabId("AGENTS.md")).toBe(true);
    expect(isShareableCenterTabId("terminal")).toBe(false);
    expect(isShareableCenterTabId("terminal-tab:abc")).toBe(false);
    expect(isShareableCenterTabId("browser:1")).toBe(false);

    let layout = createDefaultLayout(["terminal", "files"], "files");
    layout = splitPane(layout, { direction: "right" });
    layout = openTabOnFocusedPane(layout, "terminal");
    const secondaryId = layout.focusedPaneId;
    expect(getPane(layout, secondaryId)!.tabIds).not.toContain("terminal");
    expect(getPane(layout, DEFAULT_PANE_ID)!.tabIds).toContain("terminal");
  });

  it("closes a shareable tab in one pane without removing it from siblings", () => {
    let layout = createDefaultLayout(["files", "terminal", "wiki"], "files");
    layout = splitPane(layout, { direction: "right" });
    const secondaryId = layout.focusedPaneId;
    layout = openTabOnFocusedPane(layout, "files");
    layout = openTabOnFocusedPane(layout, "wiki");
    expect(getPane(layout, DEFAULT_PANE_ID)!.tabIds).toContain("files");
    expect(getPane(layout, secondaryId)!.tabIds).toContain("files");
    expect(getPane(layout, secondaryId)!.tabIds).toContain("wiki");

    layout = removeTabFromPane(layout, secondaryId, "files");
    expect(getPane(layout, DEFAULT_PANE_ID)!.tabIds).toContain("files");
    expect(getPane(layout, secondaryId)!.tabIds).not.toContain("files");
    expect(getPane(layout, secondaryId)!.tabIds).toContain("wiki");
  });

  it("ignores moveTabId and still creates an empty pane", () => {
    const base = createDefaultLayout(["terminal", "overview"], "terminal");
    const next = splitPane(base, { direction: "right", moveTabId: "overview" });
    const primary = next.panes.find((p) => p.id === DEFAULT_PANE_ID)!;
    expect(primary.tabIds).toContain("terminal");
    expect(primary.tabIds).toContain("overview");
    const secondary = next.panes.find((p) => p.id !== DEFAULT_PANE_ID)!;
    expect(isEmptyPane(secondary)).toBe(true);
  });

  it("reconcile keeps intentionally empty secondary panes", () => {
    let layout = createDefaultLayout(["terminal", "overview"], "terminal");
    layout = splitPane(layout, { direction: "right" });
    expect(layout.panes).toHaveLength(2);
    const next = reconcileOpenTabs(layout, ["terminal", "overview"], "terminal");
    expect(next.panes).toHaveLength(2);
    const secondary = next.panes.find((p) => p.id !== DEFAULT_PANE_ID)!;
    expect(isEmptyPane(secondary)).toBe(true);
  });

  it("caps at MAX_CENTER_PANES", () => {
    let layout = createDefaultLayout(["terminal", "overview", "wiki", "a", "b"], "terminal");
    for (let i = 0; i < MAX_CENTER_PANES + 2; i++) {
      layout = splitPane(layout, { direction: "right" });
    }
    expect(layout.panes.length).toBeLessThanOrEqual(MAX_CENTER_PANES);
  });

  it("reorders panes with arrayMove semantics", () => {
    let layout = createDefaultLayout(["terminal", "overview", "wiki"], "terminal");
    layout = splitPane(layout, { direction: "right" });
    layout = splitPane(layout, { direction: "right" });
    const before = [...layout.order];
    if (before.length < 2) return;
    const reordered = reorderPanes(layout, 0, Math.min(2, before.length - 1));
    expect(reordered.order).toHaveLength(before.length);
  });

  it("clamps fraction resize to MIN_FRACTION", () => {
    const fr = resizeAdjacentFractions([0.5, 0.5], 0, 0.9);
    expect(fr[0]!).toBeGreaterThanOrEqual(MIN_FRACTION - 1e-9);
    expect(fr[1]!).toBeGreaterThanOrEqual(MIN_FRACTION - 1e-9);
    expect(Math.abs(fr[0]! + fr[1]! - 1)).toBeLessThan(1e-9);
  });

  it("never closes the primary pane", () => {
    let layout = createDefaultLayout(["terminal", "overview", "wiki"], "terminal");
    layout = splitPane(layout, { direction: "right" });
    const next = closePane(layout, DEFAULT_PANE_ID);
    expect(next.panes.some((p) => p.id === DEFAULT_PANE_ID)).toBe(true);
    expect(next.panes.length).toBe(layout.panes.length);
  });

  it("closes a secondary empty pane without affecting primary tabs", () => {
    let layout = createDefaultLayout(["terminal", "overview", "wiki"], "terminal");
    layout = splitPane(layout, { direction: "right" });
    const secondaryId = layout.order.find((id) => id !== DEFAULT_PANE_ID)!;
    const next = closePane(layout, secondaryId);
    expect(next.panes).toHaveLength(1);
    expect(next.panes[0]!.tabIds).toContain("wiki");
    expect(next.panes[0]!.tabIds).toContain("terminal");
  });

  it("auto-closes secondary pane when its last tab is removed", () => {
    let layout = createDefaultLayout(["terminal", "overview", "wiki"], "terminal");
    layout = splitPane(layout, { direction: "right" });
    // Put wiki on the empty secondary then remove it.
    layout = focusPane(layout, layout.order.find((id) => id !== DEFAULT_PANE_ID)!);
    layout = openTabOnFocusedPane(layout, "wiki");
    expect(layout.panes).toHaveLength(2);
    const next = removeTabFromLayout(layout, "wiki");
    expect(next.panes).toHaveLength(1);
    expect(isPrimaryPane(next, next.panes[0]!.id)).toBe(true);
  });

  it("collects unique active tab ids with focus first", () => {
    let layout = createDefaultLayout(["terminal", "overview", "wiki"], "terminal");
    layout = splitPane(layout, { direction: "right" });
    layout = focusPane(layout, DEFAULT_PANE_ID);
    const ids = collectActiveTabIds(layout);
    expect(ids[0]).toBe("terminal");
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("opens a tab on the focused empty pane without taking it off the source pane", () => {
    let layout = createDefaultLayout(["terminal", "wiki"], "terminal");
    layout = splitPane(layout, { direction: "right" });
    const secondaryId = layout.order.find((id) => id !== DEFAULT_PANE_ID)!;
    expect(layout.focusedPaneId).toBe(secondaryId);
    layout = openTabOnFocusedPane(layout, "wiki");
    expect(getPane(layout, secondaryId)!.tabIds).toContain("wiki");
    expect(getPane(layout, DEFAULT_PANE_ID)!.tabIds).toContain("wiki");
  });

  it("setPaneActiveTab copies a shareable tab onto the target pane", () => {
    let layout = createDefaultLayout(["terminal", "overview", "files"], "files");
    layout = splitPane(layout, { direction: "right" });
    const secondaryId = layout.order.find((id) => id !== DEFAULT_PANE_ID)!;
    layout = setPaneActiveTab(layout, secondaryId, "files");
    const secondary = layout.panes.find((p) => p.id === secondaryId)!;
    const primary = layout.panes.find((p) => p.id === DEFAULT_PANE_ID)!;
    expect(secondary.tabIds).toContain("files");
    expect(secondary.activeTabId).toBe("files");
    expect(primary.tabIds).toContain("files");
  });

  it("activating a tab on primary does not collapse an empty secondary launcher", () => {
    let layout = createDefaultLayout(["terminal", "overview", "files"], "files");
    layout = splitPane(layout, { direction: "right" });
    expect(layout.panes).toHaveLength(2);
    layout = focusPane(layout, DEFAULT_PANE_ID);
    layout = openTabOnFocusedPane(layout, "terminal");
    expect(layout.panes).toHaveLength(2);
    const secondary = layout.panes.find((p) => p.id !== DEFAULT_PANE_ID)!;
    expect(isEmptyPane(secondary)).toBe(true);
  });

  it("findPaneIdForTab prefers the focused pane when several panes own the tab", () => {
    let layout = createDefaultLayout(["files", "terminal"], "files");
    layout = splitPane(layout, { direction: "right" });
    layout = openTabOnFocusedPane(layout, "files");
    expect(findPaneIdForTab(layout, "files")).toBe(layout.focusedPaneId);
    layout = focusPane(layout, DEFAULT_PANE_ID);
    expect(findPaneIdForTab(layout, "files")).toBe(DEFAULT_PANE_ID);
  });

  it("opens Overview on the focused pane without taking it off siblings", () => {
    let layout = createDefaultLayout(["terminal", "overview", "wiki"], "wiki");
    layout = splitPane(layout, { direction: "right" });
    const secondaryId = layout.order.find((id) => id !== DEFAULT_PANE_ID)!;
    layout = focusPane(layout, secondaryId);
    layout = openTabOnFocusedPane(layout, OVERVIEW_TAB_ID);
    expect(getPane(layout, secondaryId)!.tabIds).toContain(OVERVIEW_TAB_ID);
    expect(getPane(layout, DEFAULT_PANE_ID)!.tabIds).toContain(OVERVIEW_TAB_ID);
  });

  it("pins Overview at the front and keeps a single Overview tab", () => {
    let layout = createDefaultLayout(["terminal", "files"], "files");
    layout = openTabOnFocusedPane(layout, OVERVIEW_TAB_ID);
    expect(layout.panes[0]!.tabIds[0]).toBe(OVERVIEW_TAB_ID);
    expect(layout.panes[0]!.tabIds.filter((id) => id === OVERVIEW_TAB_ID)).toHaveLength(1);
    layout = openTabOnFocusedPane(layout, OVERVIEW_TAB_ID);
    expect(layout.panes[0]!.tabIds.filter((id) => id === OVERVIEW_TAB_ID)).toHaveLength(1);
  });

  it("does not inject Overview when the primary pane loses its last tab", () => {
    const layout = createDefaultLayout(["terminal"], "terminal");
    const next = removeTabFromLayout(layout, "terminal");
    expect(isEmptyPane(next.panes[0])).toBe(true);
    expect(next.panes[0]!.tabIds).not.toContain(OVERVIEW_TAB_ID);
  });

  it("reconciles missing open tabs onto the focused pane", () => {
    const layout = createDefaultLayout(["terminal"], "terminal");
    const next = reconcileOpenTabs(layout, ["terminal", "browser:1"], "browser:1");
    expect(next.panes[0]!.tabIds).toContain("browser:1");
    expect(next.panes[0]!.activeTabId).toBe("browser:1");
  });

  it("does not copy a sibling tab onto an empty or overview-only primary", () => {
    let emptyPrimary = createEmptyCenterLayout();
    emptyPrimary = splitPane(emptyPrimary, { direction: "right" });
    const emptySecondaryId = emptyPrimary.order.find((id) => id !== DEFAULT_PANE_ID)!;
    emptyPrimary = openTabOnFocusedPane(emptyPrimary, "AGENTS.md");
    const afterEmpty = reconcileOpenTabs(emptyPrimary, ["AGENTS.md"], "AGENTS.md");
    expect(findPaneIdForTab(afterEmpty, "AGENTS.md")).toBe(emptySecondaryId);
    expect(getPane(afterEmpty, DEFAULT_PANE_ID)!.tabIds).not.toContain("AGENTS.md");
    expect(isEmptyPane(getPane(afterEmpty, DEFAULT_PANE_ID))).toBe(true);
    expect(getPane(afterEmpty, emptySecondaryId)!.tabIds).toEqual(["AGENTS.md"]);

    let overviewPrimary = createDefaultLayout(["overview"], "overview");
    overviewPrimary = splitPane(overviewPrimary, { direction: "right" });
    const overviewSecondaryId = overviewPrimary.order.find((id) => id !== DEFAULT_PANE_ID)!;
    overviewPrimary = openTabOnFocusedPane(overviewPrimary, "AGENTS.md");
    const afterOverview = reconcileOpenTabs(overviewPrimary, ["AGENTS.md"], "AGENTS.md");
    expect(findPaneIdForTab(afterOverview, "AGENTS.md")).toBe(overviewSecondaryId);
    expect(isEmptyPane(getPane(afterOverview, DEFAULT_PANE_ID))).toBe(true);
    expect(getPane(afterOverview, overviewSecondaryId)!.tabIds).toEqual(["AGENTS.md"]);
  });

  it("removes closed tabs from ownership", () => {
    const layout = createDefaultLayout(["terminal", "overview"], "overview");
    const next = removeTabFromLayout(layout, "overview");
    expect(next.panes[0]!.tabIds).toContain("terminal");
    expect(next.panes[0]!.tabIds).not.toContain("overview");
    expect(next.panes[0]!.activeTabId).toBe("terminal");
  });

  it("activates the preferred MRU tab instead of the first strip item", () => {
    const layout = createDefaultLayout(["overview", "a", "b", "c"], "c");
    const next = removeTabFromLayout(layout, "c", "b");
    expect(next.panes[0]!.tabIds).toEqual(["overview", "a", "b"]);
    expect(next.panes[0]!.activeTabId).toBe("b");
  });

  it("skips Overview when closing the active tab without an MRU hint", () => {
    const layout = createDefaultLayout(["overview", "a", "b"], "b");
    const next = removeTabFromLayout(layout, "b");
    expect(next.panes[0]!.activeTabId).toBe("a");
  });

  it("reconciles a missing active tab to preferred over Overview", () => {
    const layout = createDefaultLayout(["overview", "a", "gone"], "gone");
    const next = reconcileOpenTabs(layout, ["overview", "a"], "a");
    expect(next.panes[0]!.tabIds).toEqual(["overview", "a"]);
    expect(next.panes[0]!.activeTabId).toBe("a");
  });

  it("computes row count from pane count and columns", () => {
    expect(rowCountFor(1, 2)).toBe(1);
    expect(rowCountFor(3, 2)).toBe(2);
    expect(rowCountFor(4, 2)).toBe(2);
  });

  it("syncs fraction lengths after pane count changes", () => {
    let layout = createDefaultLayout(["terminal", "overview", "wiki"], "terminal");
    layout = splitPane(layout, { direction: "right" });
    const synced = syncFractionsToPaneCount(layout);
    expect(synced.columnFractions).toHaveLength(synced.columnCount);
    expect(synced.rowFractions).toHaveLength(rowCountFor(synced.order.length, synced.columnCount));
  });

  it("tiles three panes without a leftover empty cell", () => {
    let layout = createDefaultLayout(["terminal"], "terminal");
    layout = splitPane(layout, { direction: "right" });
    layout = splitPane(layout, { direction: "right" });
    expect(layout.panes).toHaveLength(3);
    const leaves = getLeaves(layout.tree!);
    expect(leaves).toHaveLength(3);
    const geo = collectTerminalLayoutGeometry(layout.tree!);
    const area = geo.leaves.reduce((sum, leaf) => sum + leaf.width * leaf.height, 0);
    expect(area).toBeCloseTo(1, 6);
    expect(geo.leaves.every((leaf) => leaf.width > 0 && leaf.height > 0)).toBe(true);
  });

  it("rebuilds a filling tree from a legacy grid order", () => {
    const tree = treeFromReadingOrder(["a", "b", "c"], 2);
    const geo = collectTerminalLayoutGeometry(tree);
    expect(geo.leaves).toHaveLength(3);
    const area = geo.leaves.reduce((sum, leaf) => sum + leaf.width * leaf.height, 0);
    expect(area).toBeCloseTo(1, 6);
    const normalized = normalizeCenterPaneLayout({
      panes: [
        { id: "a", tabIds: ["terminal"], activeTabId: "terminal" },
        { id: "b", tabIds: [], activeTabId: "" },
        { id: "c", tabIds: [], activeTabId: "" },
      ],
      order: ["a", "b", "c"],
      columnCount: 2,
      columnFractions: [0.5, 0.5],
      rowFractions: [0.5, 0.5],
      focusedPaneId: "a",
    });
    expect(getLeaves(normalized.tree!)).toEqual(["a", "b", "c"]);
  });

  it("returns the same layout reference when reconcile/open are no-ops", () => {
    const layout = createDefaultLayout(["overview", "terminal"], "terminal");
    const reconciled = reconcileOpenTabs(layout, ["overview", "terminal"], "terminal");
    expect(reconciled).toBe(layout);
    const opened = openTabOnFocusedPane(layout, "terminal");
    expect(opened).toBe(layout);
  });

  it("persists a multi-pane fullscreen id and drops it when the mosaic collapses", () => {
    const split = splitPane(
      createDefaultLayout(["terminal", "files"], "files"),
      { direction: "right" },
    );
    const secondaryId = split.order.find((id) => id !== DEFAULT_PANE_ID)!;
    const expanded = setLayoutFullscreenPane(split, secondaryId);
    expect(expanded.fullscreenPaneId).toBe(secondaryId);
    expect(expanded).not.toBe(split);

    const ignored = setLayoutFullscreenPane(expanded, secondaryId);
    expect(ignored).toBe(expanded);

    const single = createDefaultLayout(["terminal"], "terminal");
    expect(setLayoutFullscreenPane(single, DEFAULT_PANE_ID)).toBe(single);

    const collapsed = closePane(expanded, secondaryId);
    expect(collapsed.order).toHaveLength(1);
    expect(collapsed.fullscreenPaneId ?? null).toBeNull();
  });

  it("clears fullscreen when that pane is closed and keeps it when a sibling closes", () => {
    let layout = createDefaultLayout(["terminal"], "terminal");
    layout = splitPane(layout, { direction: "right" });
    layout = splitPane(layout, { direction: "down" });
    expect(layout.order).toHaveLength(3);
    const secondaryIds = layout.order.filter((id) => id !== DEFAULT_PANE_ID);
    expect(secondaryIds).toHaveLength(2);
    const expandedId = secondaryIds[0]!;
    const siblingId = secondaryIds[1]!;
    const expanded = setLayoutFullscreenPane(layout, expandedId);
    expect(expanded.fullscreenPaneId).toBe(expandedId);

    const closedSelf = closePane(expanded, expandedId);
    expect(closedSelf.fullscreenPaneId ?? null).toBeNull();
    expect(closedSelf.order).not.toContain(expandedId);

    const closedSibling = closePane(expanded, siblingId);
    expect(closedSibling.fullscreenPaneId).toBe(expandedId);
    expect(closedSibling.order).toContain(expandedId);
    expect(closedSibling.order).toContain(DEFAULT_PANE_ID);
  });

  it("normalizes a stale fullscreen pane id off the layout", () => {
    const split = splitPane(
      createDefaultLayout(["terminal"], "terminal"),
      { direction: "right" },
    );
    const stale = normalizeCenterPaneLayout({
      ...split,
      fullscreenPaneId: "pane-missing",
    });
    expect(stale.fullscreenPaneId).toBeNull();
  });
});
