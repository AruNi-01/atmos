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
    expect(src).toContain("(val / scaleMax) * w");
    expect(src).toContain("explicitMax != null && Number.isFinite(explicitMax) && explicitMax > 0");
  });
});
