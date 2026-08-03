import { describe, expect, it } from "bun:test";
import {
  easeOutCubic,
  interpolatePoint,
  isValidScreenPoint,
  screenToOverlay,
  travelDurationMs,
  unionDisplayBounds,
} from "./agent-pointer-math.ts";

describe("agent pointer math", () => {
  it("unions multi-monitor bounds including negative origins", () => {
    const u = unionDisplayBounds([
      { x: 0, y: 0, width: 1440, height: 900 },
      { x: -1920, y: 0, width: 1920, height: 1080 },
    ]);
    expect(u.x).toBe(-1920);
    expect(u.y).toBe(0);
    expect(u.width).toBe(1920 + 1440);
    expect(u.height).toBe(1080);
  });

  it("eases travel and maps screen to overlay coords", () => {
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
    expect(easeOutCubic(0.5)).toBeGreaterThan(0.5);
    const p = interpolatePoint({ x: 0, y: 0 }, { x: 100, y: 0 }, 1);
    expect(p.x).toBe(100);
    const local = screenToOverlay({ x: -100, y: 50 }, { x: -200, y: 0, width: 400, height: 300 });
    expect(local).toEqual({ x: 100, y: 50 });
  });

  it("clamps travel duration and validates points", () => {
    expect(travelDurationMs({ x: 0, y: 0 }, { x: 0, y: 0 })).toBe(120);
    expect(travelDurationMs({ x: 0, y: 0 }, { x: 10000, y: 0 })).toBe(480);
    expect(isValidScreenPoint(1, 2)).toBe(true);
    expect(isValidScreenPoint(NaN, 2)).toBe(false);
  });
});
