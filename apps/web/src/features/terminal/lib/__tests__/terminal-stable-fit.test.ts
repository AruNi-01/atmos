import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  createStableGridScheduler,
  gridSizesEqual,
  TERMINAL_STABLE_FIT_MAX_FRAMES,
} from "../terminal-stable-fit";

function createManualFrames() {
  const frames: Array<() => void> = [];
  return {
    requestFrame(callback: () => void) {
      frames.push(callback);
      return frames.length;
    },
    cancelFrame(handle: number) {
      frames[handle - 1] = () => {};
    },
    tick() {
      const due = frames.splice(0, frames.length);
      for (const fn of due) fn();
    },
  };
}

describe("createStableGridScheduler", () => {
  it("applies once the proposed grid is unchanged for a frame", () => {
    const frames = createManualFrames();
    const applied: Array<{ cols: number; rows: number }> = [];
    let proposed = { cols: 80, rows: 24 };
    const scheduler = createStableGridScheduler({
      measure: () => proposed,
      isCurrent: () => false,
      apply: (size) => applied.push(size),
      requestFrame: frames.requestFrame,
      cancelFrame: frames.cancelFrame,
    });
    scheduler.request();
    proposed = { cols: 90, rows: 24 };
    frames.tick();
    expect(applied).toEqual([]);
    frames.tick();
    expect(applied).toEqual([{ cols: 90, rows: 24 }]);
  });

  it("applies after the frame cap when the grid keeps changing", () => {
    const frames = createManualFrames();
    const applied: Array<{ cols: number; rows: number }> = [];
    let cols = 80;
    const scheduler = createStableGridScheduler({
      measure: () => ({ cols: cols++, rows: 24 }),
      isCurrent: () => false,
      apply: (size) => applied.push(size),
      requestFrame: frames.requestFrame,
      cancelFrame: frames.cancelFrame,
    });
    scheduler.request();
    for (let i = 0; i < TERMINAL_STABLE_FIT_MAX_FRAMES; i += 1) {
      frames.tick();
    }
    expect(applied).toHaveLength(1);
    expect(applied[0]?.rows).toBe(24);
  });

  it("does not apply when the terminal already matches", () => {
    const frames = createManualFrames();
    const applied: Array<{ cols: number; rows: number }> = [];
    const scheduler = createStableGridScheduler({
      measure: () => ({ cols: 80, rows: 24 }),
      isCurrent: (size) => size.cols === 80 && size.rows === 24,
      apply: (size) => applied.push(size),
      requestFrame: frames.requestFrame,
      cancelFrame: frames.cancelFrame,
    });
    scheduler.request();
    frames.tick();
    expect(applied).toEqual([]);
  });

  it("flush applies the latest measured size", () => {
    const frames = createManualFrames();
    const applied: Array<{ cols: number; rows: number }> = [];
    let proposed = { cols: 80, rows: 24 };
    const scheduler = createStableGridScheduler({
      measure: () => proposed,
      isCurrent: () => false,
      apply: (size) => applied.push(size),
      requestFrame: frames.requestFrame,
      cancelFrame: frames.cancelFrame,
    });
    scheduler.request();
    proposed = { cols: 120, rows: 40 };
    scheduler.flush();
    expect(applied).toEqual([{ cols: 120, rows: 40 }]);
  });
});

describe("gridSizesEqual", () => {
  it("compares both axes", () => {
    expect(gridSizesEqual({ cols: 80, rows: 24 }, { cols: 80, rows: 24 })).toBe(true);
    expect(gridSizesEqual({ cols: 80, rows: 24 }, { cols: 81, rows: 24 })).toBe(false);
    expect(gridSizesEqual(null, { cols: 80, rows: 24 })).toBe(false);
  });
});

describe("stable fit wiring", () => {
  it("fits xterm locally and holds shell PTY until settle", () => {
    const terminal = readFileSync(
      join(import.meta.dir, "../../components/Terminal.tsx"),
      "utf8",
    );
    expect(terminal).toContain("createStableGridScheduler");
    expect(terminal).toContain("hostResizePinRef.current.hold(size)");
    expect(terminal).toContain("hostResizePinRef.current.debounce(size)");
    expect(terminal).not.toContain("applyTerminalPreviewScale");
    expect(terminal).not.toContain("clearTextureAtlas");
    expect(terminal).not.toContain("paintXtermAfterGridChange");
  });
});
