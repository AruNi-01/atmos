import { describe, expect, it } from "bun:test";
import {
  arcControlPoint,
  atmosTopRightLanding,
  easeInOutCubic,
  FLY_CARD_HEIGHT,
  FLY_CARD_WIDTH,
  quadBezier,
  rectCenter,
} from "./capture-fly.ts";

describe("capture fly-to-Atmos math", () => {
  it("rectCenter is midpoint", () => {
    expect(rectCenter({ x: 10, y: 20, width: 100, height: 40 })).toEqual({
      x: 60,
      y: 40,
    });
  });

  it("atmosTopRightLanding sits in the trailing chrome zone", () => {
    const p = atmosTopRightLanding({ x: 100, y: 50, width: 1200, height: 800 });
    expect(p.x).toBeCloseTo(100 + 1200 - 52 - FLY_CARD_WIDTH / 2, 5);
    expect(p.y).toBeCloseTo(50 + 10 + FLY_CARD_HEIGHT / 2, 5);
  });

  it("arcControlPoint is not collinear — creates a lift", () => {
    const from = { x: 0, y: 500 };
    const to = { x: 1000, y: 100 };
    const c = arcControlPoint(from, to);
    // Control should sit off the straight segment (above on macOS coords).
    const midY = (from.y + to.y) / 2;
    expect(c.y).toBeLessThan(midY);
    // Ends at endpoints at t=0/1
    expect(quadBezier(0, from, c, to)).toEqual(from);
    expect(quadBezier(1, from, c, to).x).toBeCloseTo(to.x, 5);
    expect(quadBezier(1, from, c, to).y).toBeCloseTo(to.y, 5);
  });

  it("easeInOutCubic endpoints", () => {
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(1)).toBe(1);
    expect(easeInOutCubic(0.5)).toBeCloseTo(0.5, 5);
  });
});
