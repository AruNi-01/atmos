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
  mergePaneSlotBoxes,
  paneSlotBoxesForContextSwitch,
  shouldWithholdUnmeasuredPaneTerminal,
} from "@/app-shell/center-pane/use-center-pane-slot-boxes";

const dir = import.meta.dir;

function readSibling(name: string): string {
  return readFileSync(join(dir, "..", name), "utf8");
}

describe("center pane tab isolation", () => {
  it("filters the grouped-tab popover to the pane allow-list", () => {
    const stage = readSibling("CenterStage.tsx");
    expect(stage).toContain("filterGroupedTabItemsByAllowedIds");
    expect(stage).toContain("orderGroupsForPane(");
    expect(stage).toContain("filterGroupedTabItemsByAllowedIds(groupedTabItems, allowed)");
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
    const activate = readSibling("center-stage-activate.ts");
    expect(stage).toContain("const runOnThisPane = (run: () => void) => {");
    expect(stage).toContain("focusCenterPane(mosaicWriteContextId, opts.paneId)");
    expect(stage).toContain("handleCreateTerminalCenterTab={() =>");
    expect(stage).toContain("runOnThisPane(handleCreateTerminalCenterTab)");
    expect(stage).toContain('placement: "focused"');
    expect(stage).toContain("buildTabHostPaneIds");
    expect(stage).toContain("dismissCenterTabInPane");
    expect(activate).toContain("placement: opts?.placement");
    expect(stage).toContain("appendTabToStripOrder(nextTab.id)");
    expect(stage).toContain("appendTabToStripOrder(tab.value)");
    expect(stage).toContain("appendTabToStripOrder(SIMULATOR_TAB_VALUE)");
    expect(stage).toContain("appendTabToStripOrder(tab)");
    expect(stage).toContain("changeTab(tab.value)");
  });

  it("uses a top-edge mosaic handle so tabs do not steal pane or window drags", () => {
    const tabs = readSibling("center-stage-shared-tabs.tsx");
    const tabBar = readSibling("CenterStageTabBar.tsx");
    const grid = readSibling("center-pane/CenterPaneGrid.tsx");
    const css = readSibling("center-pane/center-pane-grid.css");
    const stage = readSibling("CenterStage.tsx");
    expect(tabs).toContain("desktop-no-drag relative z-20");
    expect(tabs).not.toContain("CenterPaneDragHandle");
    expect(tabs).not.toContain("pointer-events-none flex h-8 w-full");
    expect(tabBar).toContain("event.stopPropagation()");
    expect(grid).toContain('data-center-pane-drag-handle=""');
    expect(grid).toContain("absolute inset-x-0 top-0 z-30 h-1.5");
    expect(grid).toContain("dockLeafInLayoutTree");
    expect(grid).toContain("CenterPaneDockPreview");
    expect(grid).toContain("data-center-pane-dragging");
    expect(grid).toContain("useAnimatedPaneTiles");
    expect(grid).toContain("centerPaneLeafTileStyle");
    expect(grid).toContain("centerPaneFullscreenTileStyle");
    expect(grid).toContain("center-pane-leaf");
    expect(grid).toContain("data-pane-snap");
    expect(grid).toContain("contextId");
    expect(grid).toContain("isOnlyPane");
    expect(css).toContain("left 280ms");
    expect(css).toContain("[data-live-resizing]");
    expect(css).toContain("[data-pane-snap]");
    expect(stage).toContain("seedFromFullPane");
    expect(stage).toContain("mosaicContextId");
    expect(stage).toContain("paintContextId");
    expect(stage).not.toContain("showMosaic");
    expect(stage).not.toContain("mosaicHold");
    expect(stage).toContain("shouldSeedMosaicFromFullPane");
    expect(stage).toContain("shouldPersistCollapsedStripOrder");
    expect(stage).toContain("collapsedStripOrderForContext");
    expect(stage).toContain("resolveStripOrderForContext");
    expect(stage).not.toContain("prevPaneCountRef");
    expect(stage).toContain("desktop-no-drag relative min-h-0 flex-1");
    expect(stage).toContain('data-center-panel-host=""');
    expect(stage).toContain("paneSlotBoxes={paneSlotBoxes}");
    expect(stage).not.toMatch(/CENTER_STAGE_CARD_CLASS[\s\S]*\{panels\}/);
    expect(css).toContain("border-radius: var(--radius-xl)");
    expect(css).toContain("[data-center-pane-dragging]");
    expect(css).not.toContain("border-radius: var(--radius-xl) var(--radius-xl) 0 0");
  });

  it("lets an empty secondary pane close from the launcher list", () => {
    const empty = readSibling("center-pane/CenterPaneEmptyState.tsx");
    const stage = readSibling("CenterStage.tsx");
    expect(empty).not.toContain("emptyPaneHint");
    expect(empty).toContain("closePane");
    expect(empty).toContain("onClose");
    expect(stage).toContain("closeCenterPane(mosaicWriteContextId, pane.id)");
  });

  it("does not wrap file editors in Base UI TabsPanel", () => {
    const frame = readSibling("workspace-center-frame.tsx");
    // Mosaic hosts panels in a sibling overlay outside <Tabs.Root>.
    // <TabsPanel> would throw Base UI error #64 (missing TabsRootContext).
    expect(frame).not.toMatch(/<TabsPanel\b/);
  });

  it("remasures pane slots when occupancy changes and withholds an unmeasured terminal", () => {
    const slots = readSibling("center-pane/use-center-pane-slot-boxes.ts");
    const frame = readSibling("workspace-center-frame.tsx");
    expect(slots).toContain("occupancyKey");
    expect(slots).toContain("centerPaneSlotOccupancyKey(layout)");
    expect(slots).toContain("treeKey");
    expect(slots).toContain("centerPaneTreeKey");
    expect(slots).toContain("paneSlotBoxesForContextSwitch");
    expect(slots).toContain("mergePaneSlotBoxes");
    expect(slots).not.toContain("layout.order.length <= 1");
    // Context switch must not setState during render — that extra commit
    // hitches every left-sidebar hop while keep-alive trees stay mounted.
    expect(slots).not.toContain("setBoxes(switched");
    expect(slots).toContain("setSnapshot");
    expect(frame).toContain("shouldWithholdUnmeasuredPaneTerminal");
    expect(frame).toContain("applySlotGeometry: isUrlSyncedActive");
  });

  it("keeps the last usable box when a remasure misses an occupied pane", () => {
    const previous = {
      "pane-main": { top: 8, left: 8, width: 400, height: 240 },
      "pane-2": { top: 8, left: 420, width: 380, height: 240 },
    };
    const merged = mergePaneSlotBoxes(
      previous,
      { "pane-main": { top: 8, left: 8, width: 800, height: 240 } },
      ["pane-main"],
    );
    expect(merged["pane-main"]?.width).toBe(800);
    expect(merged["pane-2"]).toBeUndefined();

    const missed = mergePaneSlotBoxes(previous, {}, ["pane-main"]);
    expect(missed["pane-main"]).toEqual(previous["pane-main"]);
  });

  it("restores the destination workspace slot boxes instead of morphing the previous split", () => {
    const left = { top: 8, left: 8, width: 400, height: 240 };
    const right = { top: 8, left: 420, width: 380, height: 240 };
    const first = paneSlotBoxesForContextSwitch({
      prevContextId: "ws-a",
      nextContextId: "ws-b",
      currentBoxes: { "pane-main": left, "pane-2": right },
      cache: {},
    });
    expect(first.cache["ws-a"]?.["pane-main"]).toEqual(left);
    expect(first.boxes).toEqual({});

    const back = paneSlotBoxesForContextSwitch({
      prevContextId: "ws-b",
      nextContextId: "ws-a",
      currentBoxes: {},
      cache: first.cache,
    });
    expect(back.boxes["pane-main"]).toEqual(left);
    expect(back.boxes["pane-2"]).toEqual(right);
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
    expect(
      shouldWithholdUnmeasuredPaneTerminal({
        applySlotGeometry: true,
        isPaneActive: true,
        slotBox: undefined,
      }),
    ).toBe(true);
    expect(
      shouldWithholdUnmeasuredPaneTerminal({
        applySlotGeometry: false,
        isPaneActive: true,
        slotBox: undefined,
      }),
    ).toBe(false);
  });

  it("does not default-open overview in host center chrome", () => {
    const stage = readSibling("CenterStage.tsx");
    expect(stage).toContain("useOverviewCenterTabStore");
    expect(stage).toContain("overviewTabVisible");
    expect(stage).toContain("handleCreateOverview");
    expect(stage).toContain("Overview is opt-in");
    expect(stage).not.toContain("storedLastTab === OVERVIEW_TAB_ID");
    expect(stage).not.toContain(': ["overview"]');
  });
});
