import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  createDefaultLayout,
  splitPane,
  openTabOnFocusedPane,
} from "@/app-shell/center-pane/center-pane-layout";
import {
  centerPaneSlotOccupancyKey,
  centerPaneTreeKey,
  isUsablePaneSlotBox,
} from "@/app-shell/center-pane/use-center-pane-slot-boxes";

const dir = import.meta.dir;

function readSibling(name: string): string {
  return readFileSync(join(dir, "..", name), "utf8");
}

describe("center pane tab isolation", () => {
  it("filters the grouped-tab popover to the pane allow-list", () => {
    const stage = readSibling("CenterStage.tsx");
    expect(stage).toContain("filterGroupedTabItemsByAllowedIds");
    expect(stage).toContain("orderedGroupedTabItems={filterGroupedTabItemsByAllowedIds(");
    expect(stage).toContain("allowedTabIds: allowed");
    expect(stage).toContain("paneId: pane.id");
  });

  it("keeps tab-group popover open state inside each tab bar", () => {
    const tabBar = readSibling("CenterStageTabBar.tsx");
    const stage = readSibling("CenterStage.tsx");
    expect(tabBar).toContain("const [tabGroupPopoverOpen, setTabGroupPopoverOpen] = React.useState(false);");
    expect(stage).not.toContain("const [tabGroupPopoverOpen, setTabGroupPopoverOpen]");
    expect(tabBar).not.toContain("tabGroupPopoverOpen: boolean");
  });

  it("runs create and popover select on the pane that owns the tab bar", () => {
    const stage = readSibling("CenterStage.tsx");
    expect(stage).toContain("const runOnThisPane = (run: () => void) => {");
    expect(stage).toContain("focusCenterPane(renderContextId, opts.paneId)");
    expect(stage).toContain("handleCreateTerminalCenterTab={() =>");
    expect(stage).toContain("runOnThisPane(handleCreateTerminalCenterTab)");
    expect(stage).toContain("changeTab(tab.value)");
  });

  it("uses the tab bar as a mosaic drag handle when multiple panes exist", () => {
    const tabs = readSibling("center-stage-shared-tabs.tsx");
    const grid = readSibling("center-pane/CenterPaneGrid.tsx");
    const css = readSibling("center-pane/center-pane-grid.css");
    expect(tabs).toContain("CenterPaneDragHandle");
    expect(grid).toContain("dockLeafInLayoutTree");
    expect(grid).toContain("center-pane-drag-ghost");
    expect(css).toContain("border-radius: var(--radius-xl)");
  });

  it("lets an empty secondary pane close from the launcher list", () => {
    const empty = readSibling("center-pane/CenterPaneEmptyState.tsx");
    const stage = readSibling("CenterStage.tsx");
    expect(empty).not.toContain("emptyPaneHint");
    expect(empty).toContain("closePane");
    expect(empty).toContain("onClose");
    expect(stage).toContain("closeCenterPane(renderContextId, pane.id)");
  });

  it("remasures pane slots when occupancy changes and withholds an unmeasured terminal", () => {
    const slots = readSibling("center-pane/use-center-pane-slot-boxes.ts");
    const frame = readSibling("workspace-center-frame.tsx");
    expect(slots).toContain("occupancyKey");
    expect(slots).toContain("centerPaneSlotOccupancyKey(layout)");
    expect(slots).toContain("treeKey");
    expect(slots).toContain("centerPaneTreeKey");
    expect(frame).toContain("isUsablePaneSlotBox");
    expect(frame).toContain("!isUsablePaneSlotBox(paneSlotBoxes?.[tabToPaneId?.[tab.id] ?? \"\"])");
  });

  it("changes slot occupancy when an empty pane gets its first tab", () => {
    let layout = createDefaultLayout(["terminal"], "terminal");
    layout = splitPane(layout, { direction: "right" });
    const before = centerPaneSlotOccupancyKey(layout);
    const secondaryId = layout.order.find((id) => id !== "pane-main")!;
    expect(before).toContain(`${secondaryId}:0`);

    layout = openTabOnFocusedPane(layout, "terminal-tab:new");
    const after = centerPaneSlotOccupancyKey(layout);
    expect(after).not.toBe(before);
    expect(after).toContain(`${secondaryId}:1`);
  });

  it("changes the mosaic tree key when a split percentage moves", () => {
    expect(centerPaneTreeKey("pane-main")).toBe("pane-main");
    expect(
      centerPaneTreeKey({
        direction: "row",
        first: "pane-main",
        second: "pane-2",
        splitPercentage: 40,
      }),
    ).not.toBe(
      centerPaneTreeKey({
        direction: "row",
        first: "pane-main",
        second: "pane-2",
        splitPercentage: 60,
      }),
    );
  });

  it("rejects an unmeasured slot so a new terminal does not fit at full-stage size", () => {
    expect(isUsablePaneSlotBox(undefined)).toBe(false);
    expect(isUsablePaneSlotBox({ top: 0, left: 400, width: 0, height: 0 })).toBe(false);
    expect(isUsablePaneSlotBox({ top: 0, left: 400, width: 480, height: 320 })).toBe(true);
  });
});
