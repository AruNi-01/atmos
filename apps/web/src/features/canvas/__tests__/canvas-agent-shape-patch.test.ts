// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, it } from "bun:test";

import { CanvasAgentError } from "../lib/canvas-agent-errors";
import { planUpdateShapePartial } from "../lib/canvas-agent-shape-patch";

describe("planUpdateShapePartial", () => {
  const noteShape = {
    id: "shape:note1" as const,
    type: "note" as const,
    typeName: "shape" as const,
    x: 0,
    y: 0,
    rotation: 0,
    index: "a1" as const,
    parentId: "page:page" as const,
    isLocked: false,
    opacity: 1,
    props: { richText: { type: "doc", content: [] }, color: "yellow", scale: 1 },
    meta: {},
  };

  it("rejects h on note shapes", () => {
    expect(() =>
      planUpdateShapePartial(noteShape, { h: 100 }),
    ).toThrow(CanvasAgentError);
    try {
      planUpdateShapePartial(noteShape, { h: 100 });
    } catch (e) {
      expect(e).toBeInstanceOf(CanvasAgentError);
      expect((e as CanvasAgentError).message).toContain("props.h");
    }
  });

  it("maps w on note to scale", () => {
    const partial = planUpdateShapePartial(noteShape, { w: 400 });
    expect(partial.props).toEqual({ scale: 2 });
  });
});
