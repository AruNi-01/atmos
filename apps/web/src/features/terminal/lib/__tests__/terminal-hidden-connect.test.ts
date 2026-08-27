import { describe, expect, test } from "bun:test";
import {
  HIDDEN_PTY_CONNECT_GRID,
  shouldConnectHiddenPty,
} from "../terminal-hidden-connect";

describe("shouldConnectHiddenPty", () => {
  test("connects a hidden headless pane without requiring surfaceActive", () => {
    expect(shouldConnectHiddenPty({ surfaceActive: false, connectWhileHidden: true })).toBe(true);
  });

  test("does not connect ordinary warm keep-alive panes", () => {
    expect(shouldConnectHiddenPty({ surfaceActive: false, connectWhileHidden: false })).toBe(false);
  });

  test("visible panes still use the fit/connect path", () => {
    expect(shouldConnectHiddenPty({ surfaceActive: true, connectWhileHidden: true })).toBe(false);
  });

  test("hidden connect uses a full-size grid, not a 10x5 fit", () => {
    expect(HIDDEN_PTY_CONNECT_GRID.cols).toBeGreaterThanOrEqual(80);
    expect(HIDDEN_PTY_CONNECT_GRID.rows).toBeGreaterThanOrEqual(24);
  });
});
