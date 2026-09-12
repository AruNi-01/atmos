import { describe, expect, test } from "bun:test";
import {
  getPreferredRunLogWindow,
  resetRunLogPanelWindowForTests,
  setRunLogPanelWindow,
} from "../run-log-active-window";

describe("run-log-active-window", () => {
  test("only exposes the open Run tab while the panel is active", () => {
    resetRunLogPanelWindowForTests();
    setRunLogPanelWindow({
      projectRoot: "/tmp/proj/",
      windowName: "run-2",
      panelActive: true,
    });
    expect(getPreferredRunLogWindow("/tmp/proj")).toBe("run-2");

    setRunLogPanelWindow({
      projectRoot: "/tmp/proj",
      windowName: "run-2",
      panelActive: false,
    });
    expect(getPreferredRunLogWindow("/tmp/proj")).toBeUndefined();
  });

  test("ignores a preferred window from another project", () => {
    resetRunLogPanelWindowForTests();
    setRunLogPanelWindow({
      projectRoot: "/tmp/proj-a",
      windowName: "run-main",
      panelActive: true,
    });
    expect(getPreferredRunLogWindow("/tmp/proj-b")).toBeUndefined();
  });
});
