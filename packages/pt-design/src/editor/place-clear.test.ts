import { describe, expect, test } from "bun:test";
import { defaultNodeFor } from "../components/registry";
import {
  catalogPlaceAt,
  findClearPlacement,
  occupiedNodeRects,
  preferredPlaceOrigin,
  rectsOverlap,
  sceneViewportRect,
} from "./place-clear";

describe("clear catalog placement", () => {
  test("empty board keeps the preferred origin", () => {
    expect(findClearPlacement([], { w: 100, h: 40 }, { x: 80, y: 80 })).toEqual({ x: 80, y: 80 });
  });

  test("next item sits to the right of the last component instead of stacking", () => {
    const last = { x: 80, y: 80, w: 120, h: 36 };
    const origin = preferredPlaceOrigin(last, undefined, { w: 120, h: 36 });
    expect(origin).toEqual({ x: 224, y: 80, wrapX: 80 });
    const next = findClearPlacement([last], { w: 120, h: 36 }, origin, { wrapX: origin.wrapX });
    expect(next).toEqual({ x: 224, y: 80 });
    expect(rectsOverlap({ ...last }, { x: next.x, y: next.y, w: 120, h: 36 }, 24)).toBe(false);
  });

  test("a blocked row wraps below the cluster", () => {
    const last = { x: 304, y: 80, w: 200, h: 80 };
    const occupied = [{ x: 80, y: 80, w: 200, h: 80 }, last];
    const viewport = { x: 0, y: 0, w: 700, h: 400 };
    const origin = preferredPlaceOrigin(last, viewport, { w: 200, h: 80 });
    expect(origin.y).toBe(184);
    expect(origin.x).toBe(304);
    const next = findClearPlacement(occupied, { w: 200, h: 80 }, origin, {
      wrapX: origin.wrapX,
      viewport,
    });
    expect(next).toEqual({ x: 304, y: 184 });
    expect(
      occupied.some((item) => rectsOverlap(item, { x: next.x, y: next.y, w: 200, h: 80 }, 24)),
    ).toBe(false);
  });

  test("occupied rects follow page-level node boxes", () => {
    expect(
      occupiedNodeRects([
        { x: 20, y: 20, width: 40, height: 20 },
        { x: 80, y: 20, width: 40, height: 20 },
      ]),
    ).toEqual([
      { x: 20, y: 20, w: 40, h: 20 },
      { x: 80, y: 20, w: 40, h: 20 },
    ]);
  });

  test("scene viewport uses Excalidraw scroll math and chrome insets", () => {
    expect(
      sceneViewportRect(
        { scrollX: 40, scrollY: 10, zoom: { value: 1 }, width: 1000, height: 800 },
        { left: 20, top: 70, right: 360, bottom: 50 },
      ),
    ).toEqual({ x: -20, y: 60, w: 620, h: 680 });
  });

  test("repeated catalog places do not overlap", () => {
    const viewport = { x: 0, y: 0, w: 1400, h: 900 };
    const nodes: Array<{ x: number; y: number; width: number; height: number }> = [];
    for (const type of ["button", "input", "card", "block.auth-form", "avatar"] as const) {
      const sample = defaultNodeFor(type, type);
      const at = catalogPlaceAt(nodes, { w: sample.width, h: sample.height }, viewport);
      nodes.push({ x: at.x, y: at.y, width: sample.width, height: sample.height });
    }
    expect(nodes).toHaveLength(5);
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i]!;
        const b = nodes[j]!;
        expect(
          rectsOverlap(
            { x: a.x, y: a.y, w: a.width, h: a.height },
            { x: b.x, y: b.y, w: b.width, h: b.height },
            24,
          ),
        ).toBe(false);
      }
    }
  });
});
