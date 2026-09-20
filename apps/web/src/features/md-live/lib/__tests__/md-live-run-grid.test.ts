import { afterEach, describe, expect, test } from "bun:test";
import type { TerminalGridHandle } from "@/features/terminal/lib/terminal-grid-utils";
import { resolveMdLiveRunGrid } from "../md-live-run-grid";
import {
  MD_LIVE_HEADLESS_PTY,
  getMdLiveTerminalGrid,
  registerMdLiveTerminalGrid,
  subscribeMdLiveTerminalGridMount,
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

describe("resolveMdLiveRunGrid", () => {
  afterEach(() => {
    registerMdLiveTerminalGrid(null);
  });

  test("returns the mounted grid without requesting a mount", async () => {
    const grid = stubGrid();
    let mounted = false;
    const resolved = await resolveMdLiveRunGrid({
      getGrid: () => grid,
      ensureGrid: () => {
        mounted = true;
      },
      waitForGrid: async () => {
        throw new Error("should not wait when already mounted");
      },
    });
    expect(resolved).toBe(grid);
    expect(mounted).toBe(false);
  });

  test("requests a background mount and waits when Terminal was never opened", async () => {
    const grid = stubGrid();
    let mounted = false;
    const resolved = await resolveMdLiveRunGrid({
      getGrid: () => null,
      ensureGrid: () => {
        mounted = true;
      },
      waitForGrid: async () => grid,
    });
    expect(mounted).toBe(true);
    expect(resolved).toBe(grid);
  });

  test("returns null when the grid never mounts so the caller must not lock", async () => {
    const resolved = await resolveMdLiveRunGrid({
      getGrid: () => null,
      waitForGrid: async () => null,
    });
    expect(resolved).toBeNull();
  });

  test("headless PTY options never reuse or focus the interactive shell", () => {
    expect(MD_LIVE_HEADLESS_PTY.reuseIdlePane).toBe(false);
    expect(MD_LIVE_HEADLESS_PTY.focus).toBe(false);
    expect(MD_LIVE_HEADLESS_PTY.connectWhileHidden).toBe(true);
  });

  test("late child register resolves wait without a parent re-render", async () => {
    registerMdLiveTerminalGrid(null);
    const stop = subscribeMdLiveTerminalGridMount(() => {
      // Keep-mount only — must not publish the handle (child callback ref does that).
    });
    const pending = resolveMdLiveRunGrid();
    await Promise.resolve();
    expect(getMdLiveTerminalGrid()).toBeNull();
    const stub = stubGrid();
    registerMdLiveTerminalGrid(stub);
    await expect(pending).resolves.toBe(stub);
    stop();
  });
});
