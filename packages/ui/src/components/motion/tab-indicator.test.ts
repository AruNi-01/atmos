import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { indicatorLayoutFromViewport } from "./tab-indicator";

describe("indicatorLayoutFromViewport", () => {
  it("keeps layout pixels when the ancestor scale is 1", () => {
    expect(
      indicatorLayoutFromViewport({
        tabLeft: 18,
        tabTop: 140,
        listLeft: 10,
        listTop: 20,
        listViewportWidth: 44,
        listViewportHeight: 400,
        listOffsetWidth: 44,
        listOffsetHeight: 400,
        tabOffsetWidth: 36,
        tabOffsetHeight: 36,
        scrollLeft: 0,
        scrollTop: 0,
      }),
    ).toEqual({ x: 8, y: 120, w: 36, h: 36 });
  });

  it("undoes a popover open scale so the pill does not drift toward the origin", () => {
    const scale = 0.96;
    const box = indicatorLayoutFromViewport({
      tabLeft: 10 + 8 * scale,
      tabTop: 20 + 120 * scale,
      listLeft: 10,
      listTop: 20,
      listViewportWidth: 44 * scale,
      listViewportHeight: 400 * scale,
      listOffsetWidth: 44,
      listOffsetHeight: 400,
      tabOffsetWidth: 36,
      tabOffsetHeight: 36,
      scrollLeft: 0,
      scrollTop: 0,
    });
    expect(box.x).toBeCloseTo(8);
    expect(box.y).toBeCloseTo(120);
    expect(box.w).toBe(36);
    expect(box.h).toBe(36);
  });

  it("undoes a spring overshoot so the pill does not drift away from the origin", () => {
    const scale = 1.04;
    const box = indicatorLayoutFromViewport({
      tabLeft: 10 + 8 * scale,
      tabTop: 20 + 120 * scale,
      listLeft: 10,
      listTop: 20,
      listViewportWidth: 44 * scale,
      listViewportHeight: 400 * scale,
      listOffsetWidth: 44,
      listOffsetHeight: 400,
      tabOffsetWidth: 36,
      tabOffsetHeight: 36,
      scrollLeft: 0,
      scrollTop: 0,
    });
    expect(box.x).toBeCloseTo(8);
    expect(box.y).toBeCloseTo(120);
  });
});

describe("motion tabs indicator", () => {
  it("measures the sliding pill in unscaled layout pixels", () => {
    const source = readFileSync(join(import.meta.dir, "tabs.tsx"), "utf8");
    expect(source).toContain("indicatorLayoutFromViewport");
    expect(source).toContain("selected.offsetWidth");
    expect(source).toContain("selected.offsetHeight");
  });
});
