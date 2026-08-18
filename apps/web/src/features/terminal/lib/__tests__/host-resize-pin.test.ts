import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  createHostResizePinScheduler,
  HOST_RESIZE_DRAG_ATTR,
  HOST_RESIZE_PIN_INTERVAL_MS,
  isHostResizeDragActive,
  shouldDiscardXtermScrollbackOnResize,
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

  it("skips TUI scrollback discard only while a host resize drag is live", () => {
    expect(
      shouldDiscardXtermScrollbackOnResize({
        inlineMouseTuiActive: true,
        hostResizeDragActive: false,
      }),
    ).toBe(true);
    expect(
      shouldDiscardXtermScrollbackOnResize({
        inlineMouseTuiActive: true,
        hostResizeDragActive: true,
      }),
    ).toBe(false);
    expect(
      shouldDiscardXtermScrollbackOnResize({
        inlineMouseTuiActive: false,
        hostResizeDragActive: false,
      }),
    ).toBe(false);
  });

  it("sends immediately when the host is not dragging", () => {
    const sent: TerminalGridSize[] = [];
    const scheduler = createHostResizePinScheduler({
      send: (size) => sent.push(size),
      isDragActive: () => false,
    });
    scheduler.schedule({ cols: 80, rows: 24 });
    scheduler.schedule({ cols: 90, rows: 24 });
    expect(sent).toEqual([
      { cols: 80, rows: 24 },
      { cols: 90, rows: 24 },
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
  it("batches TUI fit and skips CSI 3J while a host splitter is dragged", () => {
    const terminal = readFileSync(
      join(import.meta.dir, "../../components/Terminal.tsx"),
      "utf8",
    );
    expect(terminal).toContain("createHostResizePinScheduler");
    expect(terminal).toContain("shouldDiscardXtermScrollbackOnResize");
    expect(terminal).toContain("isHostResizeDragActive()");
    expect(terminal).toContain("isInlineMouseTuiScrollbackSurface(term)");
    expect(terminal).toContain("hostResizePinRef.current.flush()");
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
