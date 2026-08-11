import { describe, expect, test } from "bun:test";

import {
  createGridMorph,
  createSeriesMorph,
  seriesScaleDiscontinuity,
} from "./morph";

describe("seriesScaleDiscontinuity", () => {
  test("detects tokens → cost peak jump", () => {
    expect(
      seriesScaleDiscontinuity([5_000_000, 3_000_000], [50, 30]),
    ).toBe(true);
  });

  test("ignores same-scale updates", () => {
    expect(
      seriesScaleDiscontinuity([100, 200, 150], [120, 180, 160]),
    ).toBe(false);
  });

  test("treats zero ↔ non-zero as discontinuity", () => {
    expect(seriesScaleDiscontinuity([0, 0], [10, 20])).toBe(true);
    expect(seriesScaleDiscontinuity([10, 20], [0, 0])).toBe(true);
  });
});

describe("createSeriesMorph", () => {
  test("grows in on first retarget", () => {
    const morph = createSeriesMorph();
    morph.retarget([100, 200]);
    const start = morph.sample(true);
    expect(start).toEqual([100, 200]);
  });

  test("morphs same-scale values without reset", () => {
    const morph = createSeriesMorph();
    morph.retarget([100, 200]);
    morph.sample(true);
    morph.retarget([150, 250]);
    // reducedMotion snaps to target; mid-scale still lands on new values.
    expect(morph.sample(true)).toEqual([150, 250]);
  });

  test("enters from zero on tokens ↔ cost scale jump", () => {
    const morph = createSeriesMorph();
    morph.retarget([5_000_000, 3_000_000]);
    morph.sample(true);

    morph.retarget([50, 30]);
    // Immediately after retarget, current is the from-values (zeros for enter).
    expect(morph.current()).toEqual([0, 0]);
    expect(morph.sample(true)).toEqual([50, 30]);
  });
});

describe("createGridMorph", () => {
  test("enters on same shape when segment magnitudes jump (metric flip)", () => {
    const morph = createGridMorph();
    morph.retarget([
      [1_000_000, 500_000],
      [800_000, 200_000],
    ]);
    morph.sample(true);

    morph.retarget([
      [10, 5],
      [8, 2],
    ]);
    // Scale discontinuity inside flat series → enter from zero.
    const mid = morph.sample(false);
    // Early frame should still be near zero, not mid-lerp of millions.
    expect(mid[0]![0]!).toBeLessThan(1);
  });

  test("retargetEnter grows from zero even when shape is unchanged", () => {
    const morph = createGridMorph();
    morph.retarget([
      [100, 50],
      [80, 20],
    ]);
    morph.sample(true);

    morph.retargetEnter([
      [10, 5],
      [8, 2],
    ]);
    expect(morph.sample(false)[0]![0]!).toBeLessThan(1);
    expect(morph.sample(true)).toEqual([
      [10, 5],
      [8, 2],
    ]);
  });
});
