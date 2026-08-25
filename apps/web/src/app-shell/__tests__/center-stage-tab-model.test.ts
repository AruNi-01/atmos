import { describe, expect, test } from "bun:test";
import {
  appendCenterTabToStripOrder,
  CENTER_STRIP_SHORTCUT_LIMIT,
  collectDefaultCenterStripTabIds,
  getCenterStripShortcutDigit,
  getCenterStripShortcutDigitForTab,
  orderCenterTabsBySavedOrder,
  orderIdsBySavedOrder,
  resolveCenterStripShortcutTabId,
  resolveCenterStripShortcutTabIds,
  centerStripShortcutDigitFromEvent,
  type CenterTabDescriptor,
} from "@/app-shell/center-stage-tab-model";

describe("orderCenterTabsBySavedOrder", () => {
  test("applies saved order and appends new tabs", () => {
    const tabs: CenterTabDescriptor[] = [
      { id: "a", value: "a", kind: "file", label: "A" },
      { id: "b", value: "b", kind: "file", label: "B" },
      { id: "c", value: "c", kind: "terminal", label: "C" },
    ];
    expect(orderCenterTabsBySavedOrder(tabs, ["c", "a"]).map((tab) => tab.id)).toEqual([
      "c",
      "a",
      "b",
    ]);
  });

  test("returns original order when no saved order", () => {
    const tabs: CenterTabDescriptor[] = [
      { id: "a", value: "a", kind: "file", label: "A" },
      { id: "b", value: "b", kind: "file", label: "B" },
    ];
    expect(orderCenterTabsBySavedOrder(tabs).map((tab) => tab.id)).toEqual(["a", "b"]);
  });
});

describe("appendCenterTabToStripOrder", () => {
  test("appends after the current visual strip when nothing has been dragged", () => {
    expect(
      appendCenterTabToStripOrder(
        [],
        ["terminal", "changes", "src/a.ts", "browser-1"],
        "terminal-tab:new",
      ),
    ).toEqual(["terminal", "changes", "src/a.ts", "browser-1", "terminal-tab:new"]);
  });

  test("appends after the saved strip instead of grouping with other terminals", () => {
    expect(
      appendCenterTabToStripOrder(
        ["src/a.ts", "terminal", "browser-1"],
        ["terminal", "src/a.ts", "browser-1"],
        "terminal-tab:new",
      ),
    ).toEqual(["src/a.ts", "terminal", "browser-1", "terminal-tab:new"]);
  });

  test("moves a re-added fixed Terminal to the end instead of restoring its old slot", () => {
    expect(
      appendCenterTabToStripOrder(
        ["terminal", "src/a.ts", "browser-1"],
        ["src/a.ts", "browser-1"],
        "terminal",
      ),
    ).toEqual(["src/a.ts", "browser-1", "terminal"]);
  });

  test("does not move a tab that is already open", () => {
    expect(
      appendCenterTabToStripOrder(
        ["src/a.ts", "files", "browser-1"],
        ["src/a.ts", "files", "browser-1"],
        "files",
      ),
    ).toEqual(["src/a.ts", "files", "browser-1"]);
  });
});

describe("collectDefaultCenterStripTabIds", () => {
  test("lists terminals then tools then surface tabs", () => {
    expect(
      collectDefaultCenterStripTabIds({
        terminalTabIds: ["terminal", "terminal-tab:2"],
        changesVisible: true,
        filesVisible: true,
        surfaceTabIds: ["src/a.ts", "browser-1"],
      }),
    ).toEqual(["terminal", "terminal-tab:2", "changes", "files", "src/a.ts", "browser-1"]);
  });
});

describe("center strip position shortcuts", () => {
  test("orders ids by saved strip, then appends new membership", () => {
    expect(orderIdsBySavedOrder(["a", "b", "c"], ["c", "a"])).toEqual(["c", "a", "b"]);
  });

  test("numbers the visual strip instead of terminal identity", () => {
    const ordered = resolveCenterStripShortcutTabIds({
      membershipIds: ["terminal", "terminal-tab:2", "src/a.ts", "files"],
      savedStripOrder: ["src/a.ts", "files", "terminal", "terminal-tab:2"],
    });
    expect(ordered).toEqual(["src/a.ts", "files", "terminal", "terminal-tab:2"]);
    expect(resolveCenterStripShortcutTabId(ordered, 1)).toBe("src/a.ts");
    expect(resolveCenterStripShortcutTabId(ordered, 2)).toBe("files");
    expect(resolveCenterStripShortcutTabId(ordered, 3)).toBe("terminal");
    expect(resolveCenterStripShortcutTabId(ordered, 9)).toBeNull();
  });

  test("limits shortcut targets to the focused pane strip when split", () => {
    expect(
      resolveCenterStripShortcutTabIds({
        membershipIds: ["terminal", "files", "src/a.ts"],
        paneTabIds: ["src/a.ts", "files"],
        savedStripOrder: ["terminal", "files", "src/a.ts"],
        constrainToPane: true,
      }),
    ).toEqual(["src/a.ts", "files"]);
  });

  test("single-pane shortcuts keep full strip membership and pane order", () => {
    expect(
      resolveCenterStripShortcutTabIds({
        membershipIds: ["terminal", "files", "src/a.ts"],
        paneTabIds: ["src/a.ts", "terminal"],
        savedStripOrder: ["terminal", "files", "src/a.ts"],
      }),
    ).toEqual(["src/a.ts", "terminal", "files"]);
  });

  test("empty split panes have no numbered shortcut targets", () => {
    expect(
      resolveCenterStripShortcutTabIds({
        membershipIds: ["terminal", "files"],
        paneTabIds: [],
        savedStripOrder: ["terminal", "files"],
        constrainToPane: true,
      }),
    ).toEqual([]);
  });

  test("skips overview in pane tab ids because it is not strip membership", () => {
    expect(
      resolveCenterStripShortcutTabIds({
        membershipIds: ["terminal", "files"],
        paneTabIds: ["overview", "files", "terminal"],
      }),
    ).toEqual(["files", "terminal"]);
  });

  test("exposes digits 1-9 only", () => {
    expect(CENTER_STRIP_SHORTCUT_LIMIT).toBe(9);
    expect(getCenterStripShortcutDigit(0)).toBe(1);
    expect(getCenterStripShortcutDigit(8)).toBe(9);
    expect(getCenterStripShortcutDigit(9)).toBeNull();
    expect(centerStripShortcutDigitFromEvent({ code: "Digit4" })).toBe(4);
    expect(centerStripShortcutDigitFromEvent({ code: "Numpad9" })).toBe(9);
    expect(centerStripShortcutDigitFromEvent({ key: "7" })).toBe(7);
    expect(centerStripShortcutDigitFromEvent({ code: "Digit0" })).toBeNull();
  });

  test("held digits follow the focused strip and hide on unfocused panes", () => {
    const focused = ["src/a.ts", "files", "terminal"];
    expect(getCenterStripShortcutDigitForTab(focused, "src/a.ts")).toBe(1);
    expect(getCenterStripShortcutDigitForTab(focused, "files")).toBe(2);
    expect(getCenterStripShortcutDigitForTab(focused, "wiki")).toBeNull();
    expect(getCenterStripShortcutDigitForTab([], "files")).toBeNull();
    expect(getCenterStripShortcutDigitForTab(null, "files")).toBeNull();
  });
});
