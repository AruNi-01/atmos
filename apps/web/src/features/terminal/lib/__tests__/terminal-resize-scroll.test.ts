import { describe, expect, it } from "bun:test";
import {
  captureXtermResizeScroll,
  clampProposedTerminalRows,
  isXtermNearBottom,
  restoreXtermResizeScroll,
} from "../terminal-resize-scroll";

describe("isXtermNearBottom", () => {
  it("treats the last wrapped prompt line as still following output", () => {
    expect(isXtermNearBottom(40, 40)).toBe(true);
    expect(isXtermNearBottom(39, 40)).toBe(true);
    expect(isXtermNearBottom(38, 40)).toBe(false);
  });
});

describe("clampProposedTerminalRows", () => {
  it("drops a row when cells would overflow the box", () => {
    expect(clampProposedTerminalRows(24, 400, 16.8)).toBe(23);
    expect(clampProposedTerminalRows(24, 403.2, 16.8)).toBe(23);
    expect(clampProposedTerminalRows(24, 420, 16.8)).toBe(24);
  });
});

describe("xterm resize scroll snapshot", () => {
  it("follows output when the viewport is on the last line", () => {
    const snapshot = captureXtermResizeScroll({
      buffer: { active: { viewportY: 20, baseY: 20, cursorY: 23 } },
    });
    expect(snapshot).toEqual({ kind: "follow" });
  });

  it("pins a marker for a scrolled-up viewport and restores that line", () => {
    const marker = { line: 8, isDisposed: false, dispose() { this.isDisposed = true; } };
    const snapshot = captureXtermResizeScroll({
      buffer: { active: { viewportY: 10, baseY: 40, cursorY: 20 } },
      registerMarker: (offset) => {
        expect(offset).toBe(10 - (40 + 20));
        return marker;
      },
    });
    expect(snapshot.kind).toBe("marker");
    marker.line = 14;
    const scrolled: number[] = [];
    let jumped = false;
    const followed = restoreXtermResizeScroll(
      {
        buffer: { active: { baseY: 50 } },
        scrollToLine: (line) => scrolled.push(line),
      },
      snapshot,
      () => {
        jumped = true;
      },
    );
    expect(followed).toBe(false);
    expect(jumped).toBe(false);
    expect(scrolled).toEqual([14]);
    expect(marker.isDisposed).toBe(true);
  });

  it("jumps to the bottom for a follow snapshot", () => {
    let jumped = false;
    const followed = restoreXtermResizeScroll(
      {
        buffer: { active: { baseY: 50 } },
        scrollToLine: () => {},
      },
      { kind: "follow" },
      () => {
        jumped = true;
      },
    );
    expect(followed).toBe(true);
    expect(jumped).toBe(true);
  });
});
