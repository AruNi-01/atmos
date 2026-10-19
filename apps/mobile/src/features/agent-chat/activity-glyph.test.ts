// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { readFileSync } from "node:fs";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { dirname, join } from "node:path";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { fileURLToPath } from "node:url";
import {
  helixDots,
  helixDurationMs,
  helixSample,
  latticeCells,
  latticeDurationMs,
  latticeMotion,
  latticeSample,
  pickLatticeVariant,
  pickWorkingStyle,
  ringDots,
  ringDurationMs,
  ringSample,
  starDelayMs,
  starTwinkle,
  workingFamily,
} from "./activity-glyph";

const dir = dirname(fileURLToPath(import.meta.url));

describe("activity glyph", () => {
  test("places nine lattice cells and holds the center out of the comet", () => {
    const wave = latticeCells("S1");
    expect(wave).toHaveLength(9);
    expect(wave.find((cell) => cell.mid)?.delay).toBe(-180);
    expect(latticeMotion("S1")).toBe("wave");
    expect(latticeDurationMs("S4")).toBe(1600);
    const comet = latticeCells("S3");
    expect(comet.find((cell) => cell.mid)?.still).toBe(true);
    expect(latticeMotion("S5")).toBe("comet");
    expect(pickLatticeVariant(0)).toBe("S1");
    expect(pickLatticeVariant(0.99)).toBe("S5");
  });

  test("the wave and the stars hit the css keyframe values", () => {
    expect(latticeSample(0, 0.14, "wave")).toEqual({ opacity: 0.14, scale: 1 });
    expect(latticeSample(0.28, 0.14, "wave")).toEqual({ opacity: 1, scale: 1.18 });
    expect(latticeSample(0.56, 0.14, "wave")).toEqual({ opacity: 0.14, scale: 1 });
    expect(latticeSample(0, 0.14, "comet")).toEqual({ opacity: 1, scale: 1.2 });
    expect(latticeSample(0.45, 0.14, "comet")).toEqual({ opacity: 0.14, scale: 1 });
    expect(starDelayMs(1)).toBe((1400 * 0.7) / 5);
    const glyph = readFileSync(join(dir, "activity-glyph.ts"), "utf8");
    expect(glyph).toMatch(
      /export function starDelayMs\(index: number\): number \{\n {2}"worklet";/,
    );
    expect(starTwinkle(0)).toEqual({ opacity: 0, scale: 0 });
    expect(starTwinkle(0.4)).toEqual({ opacity: 1, scale: 1 });
    expect(starTwinkle(0.6).opacity).toBeCloseTo(0.9);
    expect(starTwinkle(0.6).scale).toBeCloseTo(0.8);
    expect(starTwinkle(1)).toEqual({ opacity: 0, scale: 0 });
    const row = readFileSync(join(dir, "activity-row.tsx"), "utf8");
    expect(row).toContain("TextShimmer");
    expect(row).not.toContain("ActivityGlyph");
    const mark = readFileSync(join(dir, "activity-mark.tsx"), "utf8");
    expect(mark).toContain("pickWorkingStyle");
    expect(mark).toContain("RingGlyph");
    expect(mark).toContain("HelixGlyph");
    expect(mark).toContain("chatMutedForeground(theme.isDark)");
    expect(mark).not.toContain("theme.colors.secondaryLabel");
  });

  test("working rows share web's lattice, ring, and helix pool", () => {
    expect(pickWorkingStyle(0)).toBe("S1");
    expect(pickWorkingStyle(5 / 15)).toBe("C1");
    expect(pickWorkingStyle(10 / 15)).toBe("G1");
    expect(pickWorkingStyle(0.99)).toBe("G5");
    expect(workingFamily("S4")).toBe("lattice");
    expect(workingFamily("C3")).toBe("ring");
    expect(workingFamily("G2")).toBe("helix");

    const ring = ringDots("C1");
    expect(ring).toHaveLength(8);
    expect(ring[0]?.ry).toBeCloseTo(-8);
    expect(ring[7]?.delay).toBeCloseTo(0);
    expect(ringDurationMs("C5")).toBe(1800);
    expect(ringDots("C5")[0]?.delay).toBe(-(((0 * 3) % 8) / 8) * 2200);
    expect(ringSample(0, "C1", 0.22)).toEqual({ opacity: 1, scale: 1 });
    expect(ringSample(0.5, "C1", 0.22)).toEqual({ opacity: 0.22, scale: 1 });
    expect(ringSample(0, "C2", 0.22)).toEqual({ opacity: 0.18, scale: 0.7 });
    expect(ringSample(0.5, "C2", 0.22)).toEqual({ opacity: 1, scale: 1.15 });
    expect(ringSample(0, "C4", 0.22).opacity).toBe(1);
    expect(ringSample(0.5, "C4", 0.22).opacity).toBeCloseTo(0.15);
    expect(ringSample(0, "C3", 0.22).opacity).toBeCloseTo(0.08);
    expect(ringSample(0.12, "C3", 0.22).opacity).toBe(1);

    const globe = helixDots();
    expect(globe).toHaveLength(40);
    expect(helixDurationMs("G1")).toBe(4500);
    expect(helixDurationMs("G3")).toBe(2800);
    const front = globe[16];
    expect(front?.ring).toBe(2);
    const still = helixSample(front!, "G1", 0);
    const turned = helixSample(front!, "G1", 0.125);
    expect(still.x).not.toBeCloseTo(turned.x);
    expect(helixSample(front!, "G1", 0).opacity).toBeCloseTo(helixSample(front!, "G1", 1).opacity);
    const ring0 = globe[0];
    const ring1 = globe[8];
    const held = helixSample(ring1!, "G3", 0.05);
    const start = helixSample(ring1!, "G3", 0);
    expect(held.x).toBeCloseTo(start.x);
    expect(held.y).toBeCloseTo(start.y);
    expect(helixSample(ring0!, "G3", 0.05).x).not.toBeCloseTo(helixSample(ring0!, "G3", 0).x);
  });
});
