import { describe, expect, test } from "bun:test";

import { clampToDomain } from "./domain";
import {
  GROWTH_AUTO_HEADROOM,
  growthAxisMax,
  resolveGrowthAxisMax,
  resolveGrowthInk,
  resolveGrowthPlotPadding,
  shouldPaintGrowthGuides,
} from "./growth-layout";

describe("growthAxisMax", () => {
  test("keeps the Token Usage 1.06 headroom", () => {
    expect(growthAxisMax(50)).toBeCloseTo(50 * GROWTH_AUTO_HEADROOM);
    expect(growthAxisMax(0)).toBe(1);
    expect(growthAxisMax(-4)).toBe(1);
  });
});

describe("resolveGrowthAxisMax", () => {
  test("fixed yMax replaces the auto / lerped axis", () => {
    expect(resolveGrowthAxisMax(100, 53)).toBe(100);
    expect(resolveGrowthAxisMax(1, 80)).toBe(1);
  });

  test("undefined / invalid yMax keep the auto axis", () => {
    expect(resolveGrowthAxisMax(undefined, 53)).toBe(53);
    expect(resolveGrowthAxisMax(0, 53)).toBe(53);
    expect(resolveGrowthAxisMax(Number.NaN, 53)).toBe(53);
  });
});

describe("clampToDomain on growth values", () => {
  test("clamps plotted points only when yMax is fixed", () => {
    expect(clampToDomain(140, 100)).toBe(100);
    expect(clampToDomain(-2, 100)).toBe(0);
    expect(clampToDomain(140, undefined)).toBe(140);
  });
});

describe("resolveGrowthInk", () => {
  test("hex color replaces theme ink", () => {
    expect(resolveGrowthInk("#38BDF8", "dark")).toBe("#38BDF8");
    expect(resolveGrowthInk("#0ea5e9", "light")).toBe("#0ea5e9");
    expect(resolveGrowthInk("#ABC", "dark")).toBe("#ABC");
  });

  test("omitted / invalid color keeps theme ink", () => {
    expect(resolveGrowthInk(undefined, "dark")).toBe("#FFFFFF");
    expect(resolveGrowthInk(undefined, "light")).toBe("#0F172A");
    expect(resolveGrowthInk("blue", "dark")).toBe("#FFFFFF");
    expect(resolveGrowthInk("", "light")).toBe("#0F172A");
  });
});

describe("resolveGrowthPlotPadding", () => {
  test("default padding matches the Token Usage chart", () => {
    expect(resolveGrowthPlotPadding(false, 20)).toEqual({
      padL: 32,
      padR: 10,
      padT: 10,
      padB: 22,
    });
    expect(resolveGrowthPlotPadding(false, 40)).toEqual({
      padL: 50,
      padR: 10,
      padT: 10,
      padB: 22,
    });
  });

  test("compact uses ~2/0 padding for a 40–50px area", () => {
    expect(resolveGrowthPlotPadding(true, 40)).toEqual({
      padL: 2,
      padR: 2,
      padT: 2,
      padB: 0,
    });
    expect(shouldPaintGrowthGuides(true)).toBe(false);
    expect(shouldPaintGrowthGuides(false)).toBe(true);
  });
});
