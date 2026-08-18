import { describe, expect, test } from "bun:test";
import {
  appendCenterTabToStripOrder,
  collectDefaultCenterStripTabIds,
  orderCenterTabsBySavedOrder,
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
