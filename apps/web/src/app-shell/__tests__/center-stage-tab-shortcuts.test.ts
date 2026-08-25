import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CENTER_STRIP_POSITION_HOTKEYS } from "@/app-shell/center-stage-tab-model";

function read(rel: string) {
  return readFileSync(join(import.meta.dir, rel), "utf8");
}

describe("center stage tab position shortcuts", () => {
  test("hotkeys target visual strip order instead of terminal identity", () => {
    const support = read("../center-stage-support.tsx");
    expect(support).toContain("orderedTabValues");
    expect(support).toContain("CENTER_STRIP_POSITION_HOTKEYS");
    expect(support).toContain("resolveCenterStripShortcutTabId");
    expect(support).toContain("isCenterStageHotkeyTarget");
    expect(support).toContain("registerCenterStripShortcutHandler");
    expect(support).toContain("CENTER_REGION_DIGIT_HOTKEY_OPTIONS");
    expect(support).toContain("event.shiftKey");
    expect(support).not.toContain("visibleTerminalTabs[0]");
    expect(support).not.toContain('"mod+5"');
  });

  test("center stage numbers the focused pane strip 1-9", () => {
    const stage = read("../CenterStage.tsx");
    expect(stage).toContain("focusedStripTabIds");
    expect(stage).toContain("resolveCenterStripShortcutTabIds");
    expect(stage).toContain("orderedTabValues: focusedStripTabIds");
    expect(stage).toContain("constrainToPane: isMultiPane");
    expect(CENTER_STRIP_POSITION_HOTKEYS).toBe(
      "mod+1,mod+2,mod+3,mod+4,mod+5,mod+6,mod+7,mod+8,mod+9",
    );
  });

  test("tab bar shortcut hints follow strip index, not terminal index", () => {
    const tabBar = read("../CenterStageTabBar.tsx");
    expect(tabBar).toContain("getCenterStripShortcutDigit(index)");
    expect(tabBar).toContain("renderDescriptorTab(tab, index)");
    expect(tabBar).not.toContain("CENTER_TERMINAL_SHORTCUT_LIMIT");
    expect(tabBar).not.toContain("visibleTerminalTabs.findIndex");
    expect(tabBar).toContain("CenterTabHeldShortcut");
  });

  test("held tab shortcuts overlay the original pill instead of widening it", () => {
    const tabBar = read("../CenterStageTabBar.tsx");
    const shared = read("../center-stage-shared-tabs.tsx");
    const badge = read("../HeldShortcutBadge.tsx");
    expect(badge).toContain("absolute inset-y-0 right-0");
    expect(badge).toContain("bg-gradient-to-l from-background");
    expect(tabBar).toContain("TerminalTabAgentIndicatorWithPanes contextId={effectiveContextId} tabId={tab.id}");
    expect(tabBar).not.toContain("showHeldShortcut");
    expect(shared).not.toContain("showHeldShortcut");
    expect(shared).toContain("<CenterTabHeldShortcut digit={shortcutDigit} />");
  });
});

