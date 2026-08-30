import { describe, expect, test } from "bun:test";

import {
  advectPhase,
  createSparks,
  createStars,
  featureU,
  FLAME_LENGTH,
  flameEnvelope,
  spawnSpark,
  stepStars,
} from "./exhaust-flame";

describe("flameEnvelope", () => {
  test("is 1 at the nozzle and 0 at the tail", () => {
    expect(flameEnvelope(0, 0.72)).toBe(1);
    expect(flameEnvelope(1, 0.72)).toBe(0);
  });

  test("shrinks monotonically toward the tail", () => {
    let prev = flameEnvelope(0, 0.72);
    for (let i = 1; i <= 20; i++) {
      const next = flameEnvelope(i / 20, 0.72);
      expect(next).toBeLessThan(prev);
      prev = next;
    }
  });
});

describe("leftward advection", () => {
  test("a constant-phase feature increases u as time increases", () => {
    const freq = 4.7;
    const speed = 2.65;
    const phase = advectPhase(0.2, 0, freq, speed, 2.1);
    expect(featureU(0.8, freq, speed, phase)).toBeGreaterThan(featureU(0.1, freq, speed, phase));
  });

  test("phase uses u * freq - t * speed (never ping-pongs)", () => {
    const a = advectPhase(0.4, 0.2, 5, 3, 0);
    const b = advectPhase(0.4, 0.6, 5, 3, 0);
    expect(b).toBeLessThan(a);
  });
});

describe("sparks", () => {
  test("always spawn with leftward velocity", () => {
    const rng = (() => {
      let i = 0;
      return () => {
        i += 1;
        return (i % 10) / 10;
      };
    })();
    for (let n = 0; n < 16; n++) {
      expect(spawnSpark(260, 32, rng).vx).toBeLessThan(0);
    }
  });

  test("seeded sparks are already moving left of the nozzle", () => {
    const sparks = createSparks(260, 32, () => 0.3, 8);
    expect(sparks.length).toBe(8);
    for (const spark of sparks) {
      expect(spark.vx).toBeLessThan(0);
    }
  });
});

describe("starfield background", () => {
  test("flame spans about two thirds of the track", () => {
    expect(FLAME_LENGTH).toBeGreaterThan(0.6);
    expect(FLAME_LENGTH).toBeLessThan(0.72);
  });

  test("stars cover the full track, not only the tail", () => {
    const stars = createStars(28);
    expect(stars.length).toBe(28);
    const xs = stars.map((star) => star.x).sort((a, b) => a - b);
    expect(xs[0] ?? 1).toBeLessThan(0.15);
    expect(xs[xs.length - 1] ?? 0).toBeGreaterThan(0.85);
  });

  test("stars always fly left and wrap instead of reversing", () => {
    const stars = createStars(28);
    for (const star of stars) {
      expect(star.vx).toBeLessThanOrEqual(-0.35);
    }
    const [star] = stars;
    if (!star) throw new Error("expected a star");
    const before = star.x;
    stepStars(stars, 0.05);
    expect(star.x).toBeLessThan(before);
    expect(star.vx).toBeLessThan(0);
    star.x = -0.09;
    stepStars([star], 0.016);
    expect(star.x).toBeGreaterThan(0.8);
    expect(star.vx).toBeLessThan(0);
  });
});
