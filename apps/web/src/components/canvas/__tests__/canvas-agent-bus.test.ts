// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, it, mock } from "bun:test";

import { CanvasAgentBus, type CanvasAgentDispatchInput } from "../canvas-agent-bus";

/**
 * tldraw Editor is too heavy to instantiate in a unit test (it requires a DOM
 * + a TLStore + shape utils). We hand-roll a minimal stub that satisfies the
 * narrow surface CanvasAgentBus uses: a Map of shapes plus the editor methods
 * it touches.
 */
function makeFakeEditor() {
  const shapes = new Map<
    string,
    {
      id: string;
      type: string;
      x: number;
      y: number;
      rotation: number;
      props: Record<string, unknown>;
      parentId: string;
    }
  >();
  let selectionIds: string[] = [];
  return {
    shapes,
    getCurrentPageId: () => "page:main",
    getPages: () => [{ id: "page:main", name: "Main" }],
    getCurrentPageShapes: () => Array.from(shapes.values()),
    getCurrentPageShapesSorted: () => Array.from(shapes.values()),
    getCamera: () => ({ x: 0, y: 0, z: 1 }),
    getViewportPageBounds: () => ({
      minX: -500,
      minY: -500,
      width: 1000,
      height: 1000,
      center: { x: 0, y: 0 },
    }),
    getSelectedShapeIds: () => selectionIds,
    getSelectionPageBounds: () => null,
    createShape: (input: {
      id: string;
      type: string;
      x: number;
      y: number;
      props?: Record<string, unknown>;
    }) => {
      shapes.set(input.id, {
        id: input.id,
        type: input.type,
        x: input.x,
        y: input.y,
        rotation: 0,
        props: { ...(input.props ?? {}) },
        parentId: "page:main",
      });
    },
    getShape: (id: string) => shapes.get(id),
    getShapePageBounds: (id: string) => {
      const s = shapes.get(id);
      if (!s) return null;
      const w = Number(s.props.w ?? 0);
      const h = Number(s.props.h ?? 0);
      return {
        minX: s.x,
        minY: s.y,
        maxX: s.x + w,
        maxY: s.y + h,
        width: w,
        height: h,
      };
    },
    updateShapes: (patches: Array<Record<string, unknown>>) => {
      for (const p of patches) {
        const id = String(p.id);
        const existing = shapes.get(id);
        if (!existing) continue;
        const props = { ...existing.props, ...((p.props as Record<string, unknown>) ?? {}) };
        shapes.set(id, {
          ...existing,
          x: (p.x as number) ?? existing.x,
          y: (p.y as number) ?? existing.y,
          props,
        });
      }
    },
    deleteShapes: (ids: string[]) => {
      for (const id of ids) shapes.delete(id);
    },
    select: (...ids: string[]) => {
      selectionIds = ids;
    },
    selectNone: () => {
      selectionIds = [];
    },
    setCamera: () => {},
    zoomToBounds: () => {},
    zoomToFit: () => {},
  };
}

function busFromEditor(opts?: { acceptsCommands?: boolean }) {
  const editor = makeFakeEditor();
  const bus = new CanvasAgentBus({
    isBridgeAccepting: opts?.acceptsCommands ?? true,
    log: mock(() => {}),
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  bus.setEditor(editor as any);
  return { editor, bus };
}

function call(command: string, args: Record<string, unknown> = {}): CanvasAgentDispatchInput {
  return { request_id: "req-1", command, args };
}

describe("CanvasAgentBus", () => {
  it("status works without an accepting bridge", async () => {
    const { bus } = busFromEditor({ acceptsCommands: false });
    const res = await bus.handleDispatch(call("status"));
    expect(res.success).toBe(true);
  });

  it("create_note creates a shape and reports its id", async () => {
    const { editor, bus } = busFromEditor();
    const res = await bus.handleDispatch(
      call("create_note", { text: "hello", x: 10, y: 20 }),
    );
    expect(res.success).toBe(true);
    expect(editor.shapes.size).toBe(1);
    if (res.success) {
      const data = res.data as { id: string; type: string };
      expect(data.type).toBe("note");
    }
  });

  it("create-note hyphenated alias works", async () => {
    const { bus } = busFromEditor();
    const res = await bus.handleDispatch(
      call("create-note", { text: "hi" }),
    );
    expect(res.success).toBe(true);
  });

  it("rejects mutating commands when bridge is disabled", async () => {
    const { bus } = busFromEditor({ acceptsCommands: false });
    const res = await bus.handleDispatch(call("create_note", { text: "no" }));
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error_code).toBe("BRIDGE_DISABLED");
  });

  it("layout_grid enforces cell cap", async () => {
    const { bus } = busFromEditor();
    const res = await bus.handleDispatch(
      call("layout_grid", { ids: ["x"], rows: 25, cols: 1 }),
    );
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error_code).toBe("VALIDATION_ARG");
  });

  it("layout_grid rejects more ids than cells", async () => {
    const { bus, editor } = busFromEditor();
    // Pre-populate 3 shapes so STALE_SHAPE_ID doesn't fire first.
    for (const id of ["a", "b", "c"]) {
      editor.createShape({ id, type: "note", x: 0, y: 0, props: { w: 100, h: 100 } });
    }
    const res = await bus.handleDispatch(
      call("layout_grid", { ids: ["a", "b", "c"], rows: 1, cols: 2 }),
    );
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error_code).toBe("VALIDATION_ARG");
  });

  it("delete without confirm is rejected", async () => {
    const { bus, editor } = busFromEditor();
    editor.createShape({ id: "a", type: "note", x: 0, y: 0, props: { w: 100, h: 100 } });
    const res = await bus.handleDispatch(call("delete", { ids: ["a"] }));
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error_code).toBe("VALIDATION_ARG");
  });

  it("delete with confirm removes the shape", async () => {
    const { bus, editor } = busFromEditor();
    editor.createShape({ id: "a", type: "note", x: 0, y: 0, props: { w: 100, h: 100 } });
    const res = await bus.handleDispatch(
      call("delete", { ids: ["a"], confirm: true }),
    );
    expect(res.success).toBe(true);
    expect(editor.shapes.has("a")).toBe(false);
  });

  it("update_shape rejects disallowed patch keys", async () => {
    const { bus, editor } = busFromEditor();
    editor.createShape({ id: "a", type: "note", x: 0, y: 0, props: { w: 100, h: 100 } });
    const res = await bus.handleDispatch(
      call("update_shape", { id: "a", patch: { typeName: "shape" } }),
    );
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error_code).toBe("VALIDATION_ARG");
  });

  it("update_shape applies allow-listed keys", async () => {
    const { bus, editor } = busFromEditor();
    editor.createShape({ id: "a", type: "note", x: 0, y: 0, props: { w: 100, h: 100 } });
    const res = await bus.handleDispatch(
      call("update_shape", { id: "a", patch: { color: "red", x: 33 } }),
    );
    expect(res.success).toBe(true);
    const shape = editor.shapes.get("a");
    expect(shape?.x).toBe(33);
    expect(shape?.props.color).toBe("red");
  });

  it("move shifts shape by dx/dy", async () => {
    const { bus, editor } = busFromEditor();
    editor.createShape({ id: "a", type: "note", x: 10, y: 20, props: { w: 100, h: 100 } });
    const res = await bus.handleDispatch(
      call("move", { ids: ["a"], dx: 5, dy: -3 }),
    );
    expect(res.success).toBe(true);
    expect(editor.shapes.get("a")?.x).toBe(15);
    expect(editor.shapes.get("a")?.y).toBe(17);
  });

  it("stale shape id is reported with STALE_SHAPE_ID", async () => {
    const { bus } = busFromEditor();
    const res = await bus.handleDispatch(
      call("move", { ids: ["ghost"], dx: 0, dy: 0 }),
    );
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error_code).toBe("STALE_SHAPE_ID");
  });

  it("unknown command yields UNSUPPORTED_COMMAND", async () => {
    const { bus } = busFromEditor();
    const res = await bus.handleDispatch(call("not_a_command"));
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error_code).toBe("UNSUPPORTED_COMMAND");
  });
});
