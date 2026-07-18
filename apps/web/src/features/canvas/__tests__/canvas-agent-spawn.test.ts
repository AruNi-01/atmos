// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, it } from "bun:test";

import { findNonOverlappingSpawn } from "../lib/canvas-agent-spawn";

function makeEditor(
  shapes: Array<{
    id: string;
    type: string;
    x: number;
    y: number;
    props: Record<string, unknown>;
  }>,
) {
  const byId = new Map(shapes.map((s) => [s.id, s]));
  return {
    getCurrentPageShapes: () => shapes,
    getViewportPageBounds: () => ({
      minX: -500,
      minY: -500,
      width: 1000,
      height: 1000,
      center: { x: 0, y: 0 },
    }),
    getShapePageBounds: (id: string) => {
      const s = byId.get(id);
      if (!s) return null;
      const w = Number(s.props.w ?? 100);
      const h = Number(s.props.h ?? 100);
      return {
        minX: s.x,
        minY: s.y,
        maxX: s.x + w,
        maxY: s.y + h,
        width: w,
        height: h,
        midX: s.x + w / 2,
        midY: s.y + h / 2,
      };
    },
  };
}

function overlaps(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
  gap: number,
) {
  return !(
    a.x + a.w + gap <= b.x ||
    b.x + b.w + gap <= a.x ||
    a.y + a.h + gap <= b.y ||
    b.y + b.h + gap <= a.y
  );
}

describe("findNonOverlappingSpawn", () => {
  it("returns near viewport center when empty", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pos = findNonOverlappingSpawn(makeEditor([]) as any, { w: 200, h: 200 });
    // center is 0,0 → top-left ≈ -100,-100
    expect(pos.x).toBeCloseTo(-100, 0);
    expect(pos.y).toBeCloseTo(-100, 0);
  });

  it("avoids stacking on an existing default-size geo", () => {
    const existing = {
      id: "shape:a",
      type: "geo",
      x: -100,
      y: -100,
      props: { w: 200, h: 200 },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pos = findNonOverlappingSpawn(makeEditor([existing]) as any, {
      w: 200,
      h: 200,
    });
    const candidate = { x: pos.x, y: pos.y, w: 200, h: 200 };
    const occupied = { x: -100, y: -100, w: 200, h: 200 };
    expect(overlaps(candidate, occupied, 28)).toBe(false);
  });

  it("does not use a 120×80 grid that guarantees 200×200 collisions", () => {
    // Simulate three sequential spawns with default geo size.
    const shapes: Array<{
      id: string;
      type: string;
      x: number;
      y: number;
      props: Record<string, unknown>;
    }> = [];
    for (let i = 0; i < 3; i++) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pos = findNonOverlappingSpawn(makeEditor(shapes) as any, {
        w: 200,
        h: 200,
      });
      shapes.push({
        id: `shape:${i}`,
        type: "geo",
        x: pos.x,
        y: pos.y,
        props: { w: 200, h: 200 },
      });
    }
    // Pairwise non-overlap with gap.
    for (let i = 0; i < shapes.length; i++) {
      for (let j = i + 1; j < shapes.length; j++) {
        const a = shapes[i]!;
        const b = shapes[j]!;
        expect(
          overlaps(
            { x: a.x, y: a.y, w: 200, h: 200 },
            { x: b.x, y: b.y, w: 200, h: 200 },
            28,
          ),
        ).toBe(false);
      }
    }
  });
});
