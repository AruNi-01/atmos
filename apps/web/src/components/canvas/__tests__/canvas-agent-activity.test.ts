// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, it, mock } from "bun:test";

import { CanvasAgentActivityStore } from "../canvas-agent-activity";

/**
 * Hand-rolled editor stub covering just the surface CanvasAgentActivityStore
 * touches: `getShapePageBounds` for bounds aggregation and `zoomToBounds`
 * for `jumpToLast`.
 */
function makeFakeEditor() {
  const shapes = new Map<string, { x: number; y: number; w: number; h: number }>();
  const calls = {
    zoomToBounds: mock((...args: unknown[]) => args),
  };
  return {
    _calls: calls,
    addShape(id: string, x: number, y: number, w: number, h: number) {
      shapes.set(id, { x, y, w, h });
    },
    getShapePageBounds: (id: string) => {
      const s = shapes.get(id);
      if (!s) return null;
      return {
        minX: s.x,
        minY: s.y,
        maxX: s.x + s.w,
        maxY: s.y + s.h,
        width: s.w,
        height: s.h,
      };
    },
    zoomToBounds: (...args: unknown[]) => calls.zoomToBounds(...args),
  };
}

describe("CanvasAgentActivityStore", () => {
  it("starts empty", () => {
    const store = new CanvasAgentActivityStore();
    expect(store.getSnapshot()).toBeNull();
  });

  it("record() captures command + shape ids + aggregate bounds", () => {
    const editor = makeFakeEditor();
    editor.addShape("a", 0, 0, 100, 100);
    editor.addShape("b", 200, 50, 80, 80);
    const store = new CanvasAgentActivityStore();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    store.record("layout-row", editor as any, ["a", "b"]);
    const snap = store.getSnapshot();
    expect(snap).not.toBeNull();
    expect(snap?.command).toBe("layout-row");
    expect(snap?.shapeIds).toEqual(["a", "b"]);
    expect(snap?.bounds).toEqual({ x: 0, y: 0, w: 280, h: 130 });
  });

  it("record() with no shape ids stores null bounds (read-only verbs)", () => {
    const store = new CanvasAgentActivityStore();
    store.record("status", null, []);
    const snap = store.getSnapshot();
    expect(snap?.command).toBe("status");
    expect(snap?.shapeIds).toEqual([]);
    expect(snap?.bounds).toBeNull();
  });

  it("record() with editor but unknown shape ids stores null bounds", () => {
    const editor = makeFakeEditor();
    const store = new CanvasAgentActivityStore();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    store.record("delete", editor as any, ["ghost-1"]);
    expect(store.getSnapshot()?.bounds).toBeNull();
  });

  it("subscribe() fires on every record() and clear()", () => {
    const store = new CanvasAgentActivityStore();
    const listener = mock(() => undefined);
    const unsubscribe = store.subscribe(listener);
    store.record("status", null, []);
    store.record("create-note", null, ["x"]);
    expect(listener.mock.calls.length).toBe(2);
    store.clear();
    expect(listener.mock.calls.length).toBe(3);
    expect(store.getSnapshot()).toBeNull();
    unsubscribe();
    store.record("status", null, []);
    expect(listener.mock.calls.length).toBe(3);
  });

  it("getViewState() returns a stable reference until the store mutates", () => {
    const store = new CanvasAgentActivityStore();
    const a = store.getViewState();
    const b = store.getViewState();
    expect(a).toBe(b);
    store.beginWork(null);
    const c = store.getViewState();
    expect(c).not.toBe(a);
    expect(c.inflight).toBe(true);
    const d = store.getViewState();
    expect(c).toBe(d);
    store.endWork();
    const e = store.getViewState();
    expect(e.inflight).toBe(false);

    store.beginWork(null);
    store.beginWork(null);
    expect(store.getViewState().inflight).toBe(true);
    store.endWork();
    expect(store.getViewState().inflight).toBe(true);
    store.endWork();
    expect(store.getViewState().inflight).toBe(false);
  });

  it("clear() is a no-op when already empty", () => {
    const store = new CanvasAgentActivityStore();
    const listener = mock(() => undefined);
    store.subscribe(listener);
    store.clear();
    expect(listener.mock.calls.length).toBe(0);
  });

  it("jumpToLast() zooms to the union bounds of last shape ids", () => {
    const editor = makeFakeEditor();
    editor.addShape("a", 0, 0, 100, 100);
    editor.addShape("b", 200, 50, 80, 80);
    const store = new CanvasAgentActivityStore();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    store.record("layout-row", editor as any, ["a", "b"]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    store.jumpToLast(editor as any);
    expect(editor._calls.zoomToBounds).toHaveBeenCalledTimes(1);
    const [boundsArg] = editor._calls.zoomToBounds.mock.calls[0];
    expect(boundsArg).toEqual({ x: 0, y: 0, w: 280, h: 130 });
  });

  it("jumpToLast() is a no-op when activity has no shape ids", () => {
    const editor = makeFakeEditor();
    const store = new CanvasAgentActivityStore();
    store.record("status", null, []);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    store.jumpToLast(editor as any);
    expect(editor._calls.zoomToBounds).not.toHaveBeenCalled();
  });

  it("jumpToLast() is a no-op when last shapes have been deleted", () => {
    const editor = makeFakeEditor();
    editor.addShape("a", 0, 0, 100, 100);
    const store = new CanvasAgentActivityStore();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    store.record("create-note", editor as any, ["a"]);
    // Simulate the user deleting the shape after the agent created it.
    const editor2 = makeFakeEditor();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    store.jumpToLast(editor2 as any);
    expect(editor2._calls.zoomToBounds).not.toHaveBeenCalled();
  });

  it("jumpToLast() is a no-op when nothing has been recorded yet", () => {
    const editor = makeFakeEditor();
    const store = new CanvasAgentActivityStore();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    store.jumpToLast(editor as any);
    expect(editor._calls.zoomToBounds).not.toHaveBeenCalled();
  });
});
