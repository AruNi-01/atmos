// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, it } from "bun:test";
import type { Editor, TLShape, TLShapeId } from "tldraw";

import {
  findCanvasWidgetPlacement,
  findCanvasWidgetPlacements,
} from "../lib/canvas-widget-placement";

type Rect = { x: number; y: number; w: number; h: number };

function rectsOverlap(a: Rect, b: Rect, gap = 32): boolean {
  return !(
    a.x + a.w + gap <= b.x ||
    b.x + b.w + gap <= a.x ||
    a.y + a.h + gap <= b.y ||
    b.y + b.h + gap <= a.y
  );
}

function createShape(input: {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  parentId?: string;
  type?: string;
}): TLShape {
  return {
    id: input.id as TLShapeId,
    typeName: "shape",
    type: input.type ?? "canvas-widget",
    x: input.x,
    y: input.y,
    rotation: 0,
    index: "a1",
    parentId: (input.parentId ?? "page:page") as never,
    isLocked: false,
    opacity: 1,
    props: { w: input.w, h: input.h },
    meta: {},
  } as TLShape;
}

class FakeWidgetPlacementEditor {
  constructor(
    private readonly shapes: TLShape[],
    private readonly viewportCenter = { x: 500, y: 400 },
  ) {}

  getShape = (id: TLShapeId) => this.shapes.find((shape) => shape.id === id);

  getCurrentPageShapes = () => this.shapes;

  getShapePageBounds = (id: TLShapeId) => {
    const shape = this.getShape(id);
    if (!shape) {
      return null;
    }
    const props = shape.props as { w: number; h: number };
    return {
      x: shape.x,
      y: shape.y,
      w: props.w,
      h: props.h,
      minX: shape.x,
      minY: shape.y,
      maxX: shape.x + props.w,
      maxY: shape.y + props.h,
    } as never;
  };

  getViewportPageBounds = () => ({ center: this.viewportCenter }) as never;
}

function asEditor(editor: FakeWidgetPlacementEditor): Editor {
  return editor as unknown as Editor;
}

describe("canvas-widget placement", () => {
  it("moves a single widget away from an occupied viewport-center slot", () => {
    const occupied = { x: 400, y: 350, w: 200, h: 100 };
    const editor = asEditor(
      new FakeWidgetPlacementEditor([
        createShape({
          id: "shape:occupied",
          ...occupied,
        }),
      ]),
    );

    const position = findCanvasWidgetPlacement(editor, { w: 200, h: 100 });

    expect(rectsOverlap({ ...position, w: 200, h: 100 }, occupied)).toBe(false);
    expect(position).toEqual({ x: 632, y: 350 });
  });

  it("places a multi-widget batch as one non-overlapping group", () => {
    const occupied = { x: 300, y: 330, w: 400, h: 140 };
    const sizes = [
      { w: 200, h: 100 },
      { w: 160, h: 120 },
    ];
    const editor = asEditor(
      new FakeWidgetPlacementEditor([
        createShape({
          id: "shape:occupied",
          ...occupied,
        }),
      ]),
    );

    const positions = findCanvasWidgetPlacements(editor, sizes);

    expect(positions).toHaveLength(2);
    for (const [index, position] of positions.entries()) {
      expect(rectsOverlap({ ...position, ...sizes[index]! }, occupied)).toBe(false);
    }
    expect(positions[1]!.x - positions[0]!.x).toBe(232);
  });

  it("uses the first open area inside a selected frame", () => {
    const child = { x: 124, y: 156, w: 300, h: 200 };
    const editor = asEditor(
      new FakeWidgetPlacementEditor([
        createShape({
          id: "shape:frame",
          type: "frame",
          x: 100,
          y: 100,
          w: 900,
          h: 600,
        }),
        createShape({
          id: "shape:child",
          parentId: "shape:frame",
          ...child,
        }),
      ]),
    );

    const position = findCanvasWidgetPlacement(
      editor,
      { w: 250, h: 160 },
      { frameId: "shape:frame" as TLShapeId },
    );

    expect(rectsOverlap({ ...position, w: 250, h: 160 }, child)).toBe(false);
    expect(position).toEqual({ x: 456, y: 156 });
  });

  it("keeps frame-targeted placement inside the selected frame when the frame is full", () => {
    const editor = asEditor(
      new FakeWidgetPlacementEditor([
        createShape({
          id: "shape:frame",
          type: "frame",
          x: 100,
          y: 100,
          w: 420,
          h: 320,
        }),
        createShape({
          id: "shape:child",
          parentId: "shape:frame",
          x: 124,
          y: 156,
          w: 320,
          h: 200,
        }),
      ]),
    );

    const position = findCanvasWidgetPlacement(
      editor,
      { w: 250, h: 160 },
      { frameId: "shape:frame" as TLShapeId },
    );

    expect(position.x).toBeGreaterThanOrEqual(124);
    expect(position.y).toBeGreaterThanOrEqual(156);
    expect(position.x + 250).toBeLessThanOrEqual(496);
    expect(position.y + 160).toBeLessThanOrEqual(396);
  });
});
