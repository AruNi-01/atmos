import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function readDither(file: string) {
  return readFileSync(join(import.meta.dir, file), "utf8");
}

describe("DitherRevenueLines yMax", () => {
  const src = readDither("DitherRevenueLines.tsx");

  test("reads yMax from a ref so domain updates apply without restarting draw", () => {
    expect(src).toContain("yMax?: number");
    expect(src).toContain("yMaxRef");
    expect(src).toContain("yMaxRef.current = yMax");
    expect(src).toContain("resolveDomainMax");
    expect(src).toContain("clampToDomain");
    expect(src).toMatch(/useCallback\([\s\S]*\[theme\]\s*,?\s*\)/);
  });

  test("keeps morph, reduced-motion, and tooltip", () => {
    expect(src).toContain("createGridMorph");
    expect(src).toContain("reducedMotion");
    expect(src).toContain("DitherTooltip");
  });
});

describe("DitherFunnel single-stage bar", () => {
  const src = readDither("DitherFunnel.tsx");

  test("existing maxValue API already scales one stage as a 0..1 bar", () => {
    expect(src).toContain("maxValue?: number");
    expect(src).toContain("stages.length === 1");
    expect(src).toContain("funnelValueWidth");
    expect(src).toContain("isFixedDomainMax");
  });

  test("optional track paints full-width dither before the value bar", () => {
    expect(src).toContain("trackColor?: string");
    expect(src).toContain("trackColorRef");
    expect(src).toContain("resolveFunnelTrack");
    const trackPaint = src.indexOf("if (track)");
    const fgPaint = src.lastIndexOf("FUNNEL_FOREGROUND_ALPHA");
    expect(trackPaint).toBeGreaterThan(-1);
    expect(fgPaint).toBeGreaterThan(trackPaint);
    expect(src).toContain("width: w");
    expect(src.match(/useDitherCanvas\(/g)?.length).toBe(1);
  });

  test("track is not part of the value morph signature", () => {
    expect(src).toContain("morphRef.current.retarget(stages.map((s) => s.value))");
    expect(src).toContain("const themeKey = `${stagesKey}|${theme}`");
    expect(src).not.toContain("${trackColor");
    expect(src).toContain("reducedMotion ? 0 : time");
  });
});

describe("DitherGrowth area options", () => {
  const src = readDither("DitherGrowth.tsx");

  test("reads yMax from a ref and reuses domain helpers", () => {
    expect(src).toContain("yMax?: number");
    expect(src).toContain("yMaxRef");
    expect(src).toContain("yMaxRef.current = yMax");
    expect(src).toContain("resolveGrowthAxisMax");
    expect(src).toContain("clampToDomain");
  });

  test("optional color and compact keep the default Token Usage path", () => {
    expect(src).toContain("color?: string");
    expect(src).toContain("compact?: boolean");
    expect(src).toContain("resolveGrowthInk");
    expect(src).toContain("shouldPaintGrowthGuides");
    expect(src).toContain("resolveGrowthPlotPadding");
    expect(src).toContain("createSeriesMorph");
    expect(src).toContain("DitherTooltip");
    expect(src).toContain("valuesRef.current[idx]");
  });
});
