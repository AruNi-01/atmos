import { describe, expect, it } from "bun:test";
import {
  closePane,
  collectActiveTabIds,
  createDefaultLayout,
  DEFAULT_PANE_ID,
  findPaneIdForTab,
  focusPane,
  isEmptyPane,
  isPrimaryPane,
  MAX_CENTER_PANES,
  openTabOnFocusedPane,
  OVERVIEW_TAB_ID,
  reconcileOpenTabs,
  removeTabFromLayout,
  reorderPanes,
  resizeAdjacentFractions,
  rowCountFor,
  setPaneActiveTab,
  shouldAttachActiveTabToFocusedPane,
  splitPane,
  syncFractionsToPaneCount,
  MIN_FRACTION,
} from "@/app-shell/center-pane/center-pane-layout";

describe("center-pane-layout", () => {
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

  it("opens a tab on the focused empty pane", () => {
    let layout = createDefaultLayout(["terminal", "wiki"], "terminal");
    layout = splitPane(layout, { direction: "right" });
    const secondaryId = layout.order.find((id) => id !== DEFAULT_PANE_ID)!;
    expect(layout.focusedPaneId).toBe(secondaryId);
    layout = openTabOnFocusedPane(layout, "wiki");
    expect(findPaneIdForTab(layout, "wiki")).toBe(secondaryId);
    const secondary = layout.panes.find((p) => p.id === secondaryId)!;
    expect(secondary.tabIds).toContain("wiki");
  });

  it("setPaneActiveTab steals exclusive ownership from sibling panes", () => {
    let layout = createDefaultLayout(["terminal", "overview", "files"], "files");
    layout = splitPane(layout, { direction: "right" });
    const secondaryId = layout.order.find((id) => id !== DEFAULT_PANE_ID)!;
    layout = setPaneActiveTab(layout, secondaryId, "files");
    const secondary = layout.panes.find((p) => p.id === secondaryId)!;
    const primary = layout.panes.find((p) => p.id === DEFAULT_PANE_ID)!;
    expect(secondary.tabIds).toContain("files");
    expect(secondary.activeTabId).toBe("files");
    expect(primary.tabIds).not.toContain("files");
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

  it("routes Overview open to the primary pane only", () => {
    let layout = createDefaultLayout(["terminal", "overview", "wiki"], "wiki");
    layout = splitPane(layout, { direction: "right" });
    layout = focusPane(layout, layout.order.find((id) => id !== DEFAULT_PANE_ID)!);
    layout = openTabOnFocusedPane(layout, OVERVIEW_TAB_ID);
    expect(findPaneIdForTab(layout, OVERVIEW_TAB_ID)).toBe(DEFAULT_PANE_ID);
    const secondary = layout.panes.find((p) => p.id !== DEFAULT_PANE_ID);
    if (secondary && secondary.tabIds.length > 0) {
      expect(secondary.tabIds).not.toContain(OVERVIEW_TAB_ID);
    }
  });

  it("reconciles missing open tabs onto the focused pane", () => {
    const layout = createDefaultLayout(["terminal"], "terminal");
    const next = reconcileOpenTabs(layout, ["terminal", "browser:1"], "browser:1");
    expect(next.panes[0]!.tabIds).toContain("browser:1");
    expect(next.panes[0]!.activeTabId).toBe("browser:1");
  });

  it("removes closed tabs from ownership", () => {
    const layout = createDefaultLayout(["terminal", "overview"], "overview");
    const next = removeTabFromLayout(layout, "overview");
    expect(next.panes[0]!.tabIds).toContain("terminal");
    expect(next.panes[0]!.activeTabId).toBe("terminal");
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

  it("returns the same layout reference when reconcile/open are no-ops", () => {
    const layout = createDefaultLayout(["terminal", "overview"], "terminal");
    const reconciled = reconcileOpenTabs(layout, ["terminal", "overview"], "terminal");
    expect(reconciled).toBe(layout);
    const opened = openTabOnFocusedPane(layout, "terminal");
    expect(opened).toBe(layout);
  });
});
