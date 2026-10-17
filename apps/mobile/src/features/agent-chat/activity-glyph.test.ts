// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { readFileSync } from "node:fs";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { dirname, join } from "node:path";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { fileURLToPath } from "node:url";
import {
  latticeCells,
  latticeDurationMs,
  latticeMotion,
  latticeSample,
  pickLatticeVariant,
  starDelayMs,
  starTwinkle,
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
    expect(starTwinkle(0)).toEqual({ opacity: 0, scale: 0 });
    expect(starTwinkle(0.4)).toEqual({ opacity: 1, scale: 1 });
    expect(starTwinkle(0.6).opacity).toBeCloseTo(0.9);
    expect(starTwinkle(0.6).scale).toBeCloseTo(0.8);
    expect(starTwinkle(1)).toEqual({ opacity: 0, scale: 0 });
    const row = readFileSync(join(dir, "activity-row.tsx"), "utf8");
    expect(row).toContain("ActivityGlyph");
    expect(row).toContain('kind === "thinking"');
  });
});
