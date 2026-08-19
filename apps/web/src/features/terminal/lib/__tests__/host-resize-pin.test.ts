import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  createHostResizePinScheduler,
  HOST_RESIZE_DRAG_ATTR,
  HOST_RESIZE_PIN_INTERVAL_MS,
  hostResizeSurfaceKind,
  isHostResizeDragActive,
  shouldDiscardXtermScrollbackOnResize,
  shouldPinPtyDuringHostDrag,
  type TerminalGridSize,
} from "../host-resize-pin";

function createManualClock() {
  let now = 0;
  const timers = new Map<ReturnType<typeof setTimeout>, () => void>();
  let nextId = 1;
  return {
    now: () => now,
    advance(ms: number) {
      now += ms;
      const due = [...timers.entries()];
      timers.clear();
      for (const [, fn] of due) fn();
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

describe("host-resize-pin", () => {
  it("treats the host drag attribute as active", () => {
    expect(isHostResizeDragActive({ hasAttribute: () => false })).toBe(false);
    expect(
      isHostResizeDragActive({
        hasAttribute: (name) => name === HOST_RESIZE_DRAG_ATTR,
      }),
    ).toBe(true);
  });

  it("always discards TUI scrollback on resize so old frames cannot stack", () => {
    expect(shouldDiscardXtermScrollbackOnResize({ inlineMouseTuiActive: true })).toBe(
      true,
    );
    expect(shouldDiscardXtermScrollbackOnResize({ inlineMouseTuiActive: false })).toBe(
      false,
    );
  });

  it("does not SIGWINCH an idle shell while a host splitter is dragged", () => {
    expect(shouldPinPtyDuringHostDrag("shell")).toBe(false);
    expect(shouldPinPtyDuringHostDrag("inline-tui")).toBe(true);
    expect(shouldPinPtyDuringHostDrag("alt-screen")).toBe(true);
  });

  it("classifies alternate vs inline-mouse vs idle shell", () => {
    expect(
      hostResizeSurfaceKind({
        buffer: { active: { type: "alternate" } },
        modes: { mouseTrackingMode: "any" },
      }),
    ).toBe("alt-screen");
    expect(
      hostResizeSurfaceKind({
        buffer: { active: { type: "normal" } },
        modes: { mouseTrackingMode: "any" },
      }),
    ).toBe("inline-tui");
    expect(
      hostResizeSurfaceKind({
        buffer: { active: { type: "normal" } },
        modes: { mouseTrackingMode: "none" },
      }),
    ).toBe("shell");
  });

  it("leading-edges the first size then coalesces even when not dragging", () => {
    const clock = createManualClock();
    const sent: TerminalGridSize[] = [];
    const scheduler = createHostResizePinScheduler({
      send: (size) => sent.push(size),
      isDragActive: () => false,
      intervalMs: HOST_RESIZE_PIN_INTERVAL_MS,
      now: clock.now,
      scheduleTimeout: clock.scheduleTimeout,
      clearTimeout: clock.clearTimeout,
    });
    scheduler.schedule({ cols: 80, rows: 24 });
    scheduler.schedule({ cols: 90, rows: 24 });
    scheduler.schedule({ cols: 100, rows: 30 });
    expect(sent).toEqual([{ cols: 80, rows: 24 }]);
    clock.advance(HOST_RESIZE_PIN_INTERVAL_MS);
    expect(sent).toEqual([
      { cols: 80, rows: 24 },
      { cols: 100, rows: 30 },
    ]);
  });

  it("leading-edges the first drag pin and coalesces until flush", () => {
    const clock = createManualClock();
    let dragging = true;
    const sent: TerminalGridSize[] = [];
    const scheduler = createHostResizePinScheduler({
      send: (size) => sent.push(size),
      isDragActive: () => dragging,
      intervalMs: HOST_RESIZE_PIN_INTERVAL_MS,
      now: clock.now,
      scheduleTimeout: clock.scheduleTimeout,
      clearTimeout: clock.clearTimeout,
    });

    scheduler.schedule({ cols: 80, rows: 24 });
    scheduler.schedule({ cols: 82, rows: 24 });
    scheduler.schedule({ cols: 100, rows: 30 });
    expect(sent).toEqual([{ cols: 80, rows: 24 }]);

    clock.advance(HOST_RESIZE_PIN_INTERVAL_MS);
    expect(sent).toEqual([
      { cols: 80, rows: 24 },
      { cols: 100, rows: 30 },
    ]);

    scheduler.schedule({ cols: 110, rows: 32 });
    dragging = false;
    scheduler.flush();
    expect(sent[sent.length - 1]).toEqual({ cols: 110, rows: 32 });
  });

  it("hold does not send until flush", () => {
    const clock = createManualClock();
    const sent: TerminalGridSize[] = [];
    const scheduler = createHostResizePinScheduler({
      send: (size) => sent.push(size),
      isDragActive: () => true,
      now: clock.now,
      scheduleTimeout: clock.scheduleTimeout,
      clearTimeout: clock.clearTimeout,
    });
    scheduler.hold({ cols: 80, rows: 24 });
    scheduler.hold({ cols: 120, rows: 40 });
    clock.advance(HOST_RESIZE_PIN_INTERVAL_MS);
    expect(sent).toEqual([]);
    scheduler.flush();
    expect(sent).toEqual([{ cols: 120, rows: 40 }]);
  });

  it("debounce only sends the latest size after the interval", () => {
    const clock = createManualClock();
    const sent: TerminalGridSize[] = [];
    const scheduler = createHostResizePinScheduler({
      send: (size) => sent.push(size),
      now: clock.now,
      scheduleTimeout: clock.scheduleTimeout,
      clearTimeout: clock.clearTimeout,
    });
    scheduler.debounce({ cols: 80, rows: 24 });
    scheduler.debounce({ cols: 90, rows: 24 });
    scheduler.debounce({ cols: 100, rows: 30 });
    expect(sent).toEqual([]);
    clock.advance(HOST_RESIZE_PIN_INTERVAL_MS);
    expect(sent).toEqual([{ cols: 100, rows: 30 }]);
  });

  it("cancel drops a pending drag pin", () => {
    const clock = createManualClock();
    const sent: TerminalGridSize[] = [];
    const scheduler = createHostResizePinScheduler({
      send: (size) => sent.push(size),
      isDragActive: () => true,
      now: clock.now,
      scheduleTimeout: clock.scheduleTimeout,
      clearTimeout: clock.clearTimeout,
    });
    scheduler.schedule({ cols: 80, rows: 24 });
    scheduler.schedule({ cols: 90, rows: 24 });
    scheduler.cancel();
    clock.advance(HOST_RESIZE_PIN_INTERVAL_MS);
    expect(sent).toEqual([{ cols: 80, rows: 24 }]);
  });
});

describe("host resize wiring", () => {
  it("fits xterm locally and holds shell PTY until settle", () => {
    const terminal = readFileSync(
      join(import.meta.dir, "../../components/Terminal.tsx"),
      "utf8",
    );
    expect(terminal).toContain("createHostResizePinScheduler");
    expect(terminal).toContain("createStableGridScheduler");
    expect(terminal).toContain("captureXtermResizeScroll");
    expect(terminal).toContain("scheduleFollowBottom");
    expect(terminal).toContain("applyXtermGrid(size)");
    expect(terminal).toContain("sendResizeRef.current(size)");
    expect(terminal).toContain("hostResizePinRef.current.hold(size)");
    expect(terminal).toContain("hostResizePinRef.current.debounce(size)");
    expect(terminal).toContain("hostResizePinRef.current.schedule(size)");
    expect(terminal).not.toContain("createTerminalResizeDebouncer");
    expect(terminal).not.toContain("applyTerminalPreviewScale");
    expect(terminal).not.toContain("clearTextureAtlas");
    expect(terminal).not.toContain("paintXtermAfterGridChange");
    expect(terminal).toContain("hostResizePinRef.current.flush()");
    const theme = readFileSync(
      join(import.meta.dir, "../theme.ts"),
      "utf8",
    );
    expect(theme).toContain("reflowCursorLine: false");
  });

  it("keeps mosaic and in-pane split geometry local until pointerup", () => {
    const center = readFileSync(
      join(import.meta.dir, "../../../../app-shell/center-pane/CenterPaneGrid.tsx"),
      "utf8",
    );
    const split = readFileSync(
      join(import.meta.dir, "../../components/TerminalSplitView.tsx"),
      "utf8",
    );
    expect(center).toContain("useLiveSplitLayout");
    expect(center).toContain("commitLiveResize");
    expect(center).toContain("publishLive");
    expect(center).toContain("onLiveTree");
    expect(split).toContain("useLiveSplitLayout");
    expect(split).toContain("commitLiveResize");
    expect(split).toContain("onLiveLayout");
  });
});
