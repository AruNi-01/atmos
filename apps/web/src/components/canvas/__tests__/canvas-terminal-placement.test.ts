// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, it } from "bun:test";
import type { TLEditorSnapshot } from "tldraw";

import {
  collectPageShapeBounds,
  findCanvasTerminalPlacement,
  getViewportCenterFromSession,
} from "../canvas-terminal-placement";
import { createCanvasSnapshot } from "../use-canvas-board";

function makeSnapshot(
  shapes: Array<{
    id: string;
    x: number;
    y: number;
    w: number;
    h: number;
    type?: string;
  }>,
  session?: Record<string, unknown>,
): TLEditorSnapshot {
  const store: Record<string, unknown> = {
    "page:page": {
      id: "page:page",
      typeName: "page",
      name: "Page 1",
      index: "a1",
      meta: {},
    },
  };

  for (const shape of shapes) {
    store[shape.id] = {
      id: shape.id,
      typeName: "shape",
      type: shape.type ?? "geo",
      x: shape.x,
      y: shape.y,
      rotation: 0,
      index: "a1",
      parentId: "page:page",
      isLocked: false,
      opacity: 1,
      props: { w: shape.w, h: shape.h },
      meta: {},
    };
  }

  return createCanvasSnapshot(
    { store, schema: {} } as never,
    {
      version: 0,
      currentPageId: "page:page",
      ...session,
    } as never,
  )!;
}

describe("canvas-terminal-placement", () => {
  it("places beside content without overlapping", () => {
    const snapshot = makeSnapshot([{ id: "shape:block", x: 400, y: 300, w: 400, h: 300 }]);
    const { x, y } = findCanvasTerminalPlacement(snapshot, "page:page", { w: 720, h: 420 });

    const overlaps =
      x < 400 + 400 + 32 &&
      x + 720 + 32 > 400 &&
      y < 300 + 300 + 32 &&
      y + 420 + 32 > 300;
    expect(overlaps).toBe(false);
    expect(x).toBeGreaterThanOrEqual(400 + 400 + 32);
    expect(x).toBeLessThan(400 + 400 + 32 + 200);
  });

  it("stays near content cluster when viewport session is far away", () => {
    const snapshot = makeSnapshot([{ id: "shape:block", x: 2000, y: 1500, w: 500, h: 400 }], {
      pageStates: [
        {
          pageId: "page:page",
          camera: { x: 0, y: 0, z: 1 },
        },
      ],
    });
    const { x, y } = findCanvasTerminalPlacement(snapshot, "page:page", { w: 720, h: 420 });
    expect(x).toBeGreaterThan(1800);
    expect(x).toBeLessThan(3200);
    expect(y).toBeGreaterThan(1200);
    expect(y).toBeLessThan(2200);
  });

  it("collectPageShapeBounds returns all shapes on the page", () => {
    const snapshot = makeSnapshot([
      { id: "shape:a", x: 0, y: 0, w: 100, h: 100 },
      { id: "shape:b", x: 200, y: 0, w: 50, h: 50 },
    ]);
    expect(collectPageShapeBounds(snapshot, "page:page")).toHaveLength(2);
  });
});
