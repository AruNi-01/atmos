import { describe, expect, test } from "bun:test";

import {
  FUNNEL_TRACK_ALPHA,
  funnelValueWidth,
  resolveFunnelTrack,
} from "./funnel-track";

describe("resolveFunnelTrack", () => {
  test("omitted / empty color keeps the previous no-track behavior", () => {
    expect(resolveFunnelTrack(undefined)).toBeNull();
    expect(resolveFunnelTrack("")).toBeNull();
  });

  test("a color enables a full-width track at the default alpha", () => {
    expect(resolveFunnelTrack("#94A3B8")).toEqual({
      color: "#94A3B8",
      alpha: FUNNEL_TRACK_ALPHA,
    });
  });
});

describe("funnelValueWidth", () => {
  test("maps a 0..1 stage onto the canvas when max is 1", () => {
    expect(funnelValueWidth(100, 0.4, 1)).toBeCloseTo(40);
    expect(funnelValueWidth(100, 0, 1)).toBe(0);
    expect(funnelValueWidth(100, 1, 1)).toBe(100);
  });

  test("clamps the foreground to the canvas and ignores invalid scale", () => {
    expect(funnelValueWidth(100, 1.5, 1)).toBe(100);
    expect(funnelValueWidth(100, 0.4, 0)).toBe(0);
    expect(funnelValueWidth(0, 0.4, 1)).toBe(0);
  });
});
