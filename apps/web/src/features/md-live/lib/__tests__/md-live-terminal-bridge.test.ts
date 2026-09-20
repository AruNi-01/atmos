import { describe, expect, test } from "bun:test";
import type { TerminalGridHandle } from "@/features/terminal/lib/terminal-grid-utils";
import {
  getMdLiveTerminalGrid,
  registerMdLiveTerminalGrid,
  requestMdLiveTerminalGridMount,
  subscribeMdLiveTerminalGridMount,
  waitForMdLiveTerminalGrid,
} from "../md-live-terminal-bridge";

function stubGrid(): TerminalGridHandle {
  return {
    addTerminal: () => {},
    createAndRunTerminal: async () => ({ paneId: "p1", sessionId: "s1" }),
    createOrFocusAndRunTerminal: async () => {},
    removeTerminalByTmuxWindowName: () => false,
    prefillTerminal: () => {},
    destroyAllTerminals: () => {},
    focusActivePane: () => {},
    focusPaneByTmuxWindowName: () => false,
  };
}

describe("md-live terminal grid bridge", () => {
  test("waitForMdLiveTerminalGrid resolves after register", async () => {
    registerMdLiveTerminalGrid(null);
    const grid = stubGrid();
    const pending = waitForMdLiveTerminalGrid(500);
    registerMdLiveTerminalGrid(grid);
    await expect(pending).resolves.toBe(grid);
    registerMdLiveTerminalGrid(null);
    expect(getMdLiveTerminalGrid()).toBeNull();
  });

  test("times out with null when the grid never mounts", async () => {
    registerMdLiveTerminalGrid(null);
    await expect(waitForMdLiveTerminalGrid(20)).resolves.toBeNull();
  });

  test("requestMdLiveTerminalGridMount notifies subscribers without activating chrome", () => {
    let calls = 0;
    const stop = subscribeMdLiveTerminalGridMount(() => {
      calls += 1;
    });
    requestMdLiveTerminalGridMount();
    expect(calls).toBe(1);
    stop();
    requestMdLiveTerminalGridMount();
    expect(calls).toBe(1);
  });
});
