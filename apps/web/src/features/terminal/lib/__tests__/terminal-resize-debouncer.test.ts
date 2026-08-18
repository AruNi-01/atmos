import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  createTerminalResizeDebouncer,
  TERMINAL_RESIZE_COL_DEBOUNCE_MS,
  TERMINAL_RESIZE_SMALL_BUFFER,
  type TerminalGridSize,
} from "../terminal-resize-debouncer";

function createManualClock() {
  let now = 0;
  const timers = new Map<ReturnType<typeof setTimeout>, () => void>();
  let nextId = 1;
  return {
    now: () => now,
    advance() {
      const due = [...timers.values()];
      timers.clear();
      for (const fn of due) fn();
    },
    scheduleTimeout(fn: () => void) {
      const handle = nextId as ReturnType<typeof setTimeout>;
      nextId += 1;
      timers.set(handle, fn);
      return handle;
    },
    clearTimeout(handle: ReturnType<typeof setTimeout>) {
      timers.delete(handle);
    },
  };
}

describe("terminal-resize-debouncer", () => {
  it("applies both axes immediately when asked", () => {
    const applied: TerminalGridSize[] = [];
    const rows: number[] = [];
    const debouncer = createTerminalResizeDebouncer({
      apply: (size) => applied.push(size),
      applyRows: (value) => rows.push(value),
    });
    debouncer.resize({ cols: 80, rows: 24 }, true);
    debouncer.resize({ cols: 100, rows: 30 }, true);
    expect(applied).toEqual([
      { cols: 80, rows: 24 },
      { cols: 100, rows: 30 },
    ]);
    expect(rows).toEqual([]);
  });

  it("applies rows immediately and coalesces cols for a long buffer", () => {
    const clock = createManualClock();
    const applied: TerminalGridSize[] = [];
    const rows: number[] = [];
    const debouncer = createTerminalResizeDebouncer({
      apply: (size) => applied.push(size),
      applyRows: (value) => rows.push(value),
      getBufferLength: () => TERMINAL_RESIZE_SMALL_BUFFER + 1,
      debounceMs: TERMINAL_RESIZE_COL_DEBOUNCE_MS,
      now: clock.now,
      scheduleTimeout: clock.scheduleTimeout,
      clearTimeout: clock.clearTimeout,
    });
    debouncer.resize({ cols: 80, rows: 24 });
    debouncer.resize({ cols: 90, rows: 28 });
    debouncer.resize({ cols: 120, rows: 40 });
    expect(applied).toEqual([]);
    expect(rows).toEqual([24, 28, 40]);
    clock.advance();
    expect(applied).toEqual([{ cols: 120, rows: 40 }]);
  });

  it("flush applies the latest pending col reflow", () => {
    const clock = createManualClock();
    const applied: TerminalGridSize[] = [];
    const debouncer = createTerminalResizeDebouncer({
      apply: (size) => applied.push(size),
      applyRows: () => {},
      getBufferLength: () => 1000,
      scheduleTimeout: clock.scheduleTimeout,
      clearTimeout: clock.clearTimeout,
    });
    debouncer.resize({ cols: 80, rows: 24 });
    debouncer.resize({ cols: 100, rows: 30 });
    debouncer.flush();
    expect(applied).toEqual([{ cols: 100, rows: 30 }]);
  });
});

describe("shell resize wiring", () => {
  it("uses VS Code-style col debounce and does not bitmap-scale during drag", () => {
    const terminal = readFileSync(
      join(import.meta.dir, "../../components/Terminal.tsx"),
      "utf8",
    );
    expect(terminal).toContain("createTerminalResizeDebouncer");
    expect(terminal).toContain("gridResizeDebouncerRef.current.resize");
    expect(terminal).not.toContain("applyTerminalPreviewScale");
    expect(terminal).toContain("hostResizePinRef.current.hold(size)");
  });
});
