// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, it } from "bun:test";

import { shapeIdsFromAgentResult, unionBounds } from "../canvas-agent-view-bounds";

describe("canvas-agent-view-bounds", () => {
  it("unionBounds merges two boxes", () => {
    const a = { x: 0, y: 0, w: 100, h: 50 };
    const b = { x: 80, y: 40, w: 100, h: 50 };
    expect(unionBounds(a, b, 0)).toEqual({ x: 0, y: 0, w: 180, h: 90 });
  });

  it("shapeIdsFromAgentResult reads laid_out", () => {
    expect(shapeIdsFromAgentResult({ laid_out: ["shape:a", "shape:b"] })).toEqual([
      "shape:a",
      "shape:b",
    ]);
  });
});
