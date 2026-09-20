// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { FIXED_TERMINAL_TAB_VALUE } from "@/features/terminal/lib/terminal-layout-document";
import {
  EMPTY_TERMINAL_TAB_PANES,
  automationTerminalTabIdFromWindowName,
  automationWindowNameFromTerminalTabId,
  createLayoutFromTmuxWindows,
  isAutomationTmuxWindowName,
  panesMissingTmuxWindows,
  terminalTabsAfterUnpersistedHydrate,
} from "../terminal-store-helpers";

describe("terminalTabsAfterUnpersistedHydrate", () => {
  it("keeps in-memory tabs instead of wiping them", () => {
    const existing = [{ id: FIXED_TERMINAL_TAB_VALUE, title: "Term", closable: true }];
    expect(terminalTabsAfterUnpersistedHydrate(existing, false)).toBe(existing);
    expect(terminalTabsAfterUnpersistedHydrate(existing, true)).toBe(existing);
  });

  it("seeds the fixed Term tab when tmux already has windows", () => {
    const seeded = terminalTabsAfterUnpersistedHydrate([], true);
    expect(seeded).toHaveLength(1);
    expect(seeded[0]?.id).toBe(FIXED_TERMINAL_TAB_VALUE);
    expect(seeded[0]?.closable).toBe(true);
    expect(terminalTabsAfterUnpersistedHydrate([], false)).toEqual([]);
  });

  it("does not treat automation windows as a Term hydrate gap", () => {
    expect(
      panesMissingTmuxWindows(
        { "pane-1": { id: "pane-1", tmuxWindowName: "1" } as never },
        [{ name: "auto-abcdefgh" }, { name: "1" }],
        "automation:job-1",
      ),
    ).toBe(false);
    expect(
      panesMissingTmuxWindows(
        { "pane-1": { id: "pane-1", tmuxWindowName: "auto-abcdefgh" } as never },
        [{ name: "auto-abcdefgh" }],
        "automation:job-1",
      ),
    ).toBe(false);
    expect(
      panesMissingTmuxWindows(
        { "pane-1": { id: "pane-1", tmuxWindowName: "auto-abcdefgh" } as never },
        [{ name: "auto-abcdefgh" }, { name: "1" }],
        "automation:job-1",
      ),
    ).toBe(false);
  });

  it("maps automation tmux windows to extra terminal tab ids", () => {
    expect(isAutomationTmuxWindowName("auto-abcdefgh")).toBe(true);
    expect(isAutomationTmuxWindowName("1")).toBe(false);
    expect(automationTerminalTabIdFromWindowName("auto-abcdefgh")).toBe(
      "terminal-tab:auto-abcdefgh",
    );
    expect(automationWindowNameFromTerminalTabId("terminal-tab:auto-abcdefgh")).toBe(
      "auto-abcdefgh",
    );
    expect(automationWindowNameFromTerminalTabId("terminal-tab:1")).toBeNull();
    expect(automationWindowNameFromTerminalTabId("terminal")).toBeNull();
  });

  it("does not fold automation windows into the Term split layout", () => {
    const layout = createLayoutFromTmuxWindows("automation:job-1", [
      { index: 0, name: "1" },
      { index: 1, name: "auto-abcdefgh" },
    ]);
    expect(layout).not.toBeNull();
    expect(Object.values(layout!.panes).map((pane) => pane.tmuxWindowName)).toEqual(["1"]);
    expect(
      createLayoutFromTmuxWindows("automation:job-1", [{ index: 0, name: "auto-abcdefgh" }]),
    ).toBeNull();
  });

  it("reuses one empty panes record for missing scopes", () => {
    expect(EMPTY_TERMINAL_TAB_PANES).toBe(EMPTY_TERMINAL_TAB_PANES);
    expect(Object.keys(EMPTY_TERMINAL_TAB_PANES)).toEqual([]);
  });
});

describe("tmux window list encoding", () => {
  it("encodes standalone automation scope ids in tmux REST paths", () => {
    const restApi = readFileSync(join(import.meta.dir, "../../../../api/rest-api.ts"), "utf8");
    expect(restApi).toContain(
      "`/api/system/tmux-windows/${encodeURIComponent(workspaceId)}`",
    );
  });
});
