import { describe, expect, test } from "bun:test";

import {
  createGridMorph,
  createSeriesMorph,
  remapSeriesLength,
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

  test("length change remaps the previous silhouette instead of growing from zero", () => {
    const morph = createSeriesMorph();
    morph.retarget([10, 20]);
    morph.sample(true);
    morph.retarget([10, 13, 17, 20]);
    const from = morph.current();
    expect(from).toHaveLength(4);
    expect(from.every((value) => value > 0)).toBe(true);
    expect(from[0]).toBeCloseTo(10);
    expect(from[from.length - 1]).toBeCloseTo(20);
  });

  test("unit flip remaps by relative height instead of growing from zero", () => {
    const morph = createSeriesMorph();
    morph.retarget([5_000_000, 3_000_000]);
    morph.sample(true);

    morph.retarget([50, 40]);
    // Old 5:3 silhouette at the new amplitude (peak 50) → [50, 30], then morphs to [50, 40].
    expect(morph.current()[0]).toBeCloseTo(50);
    expect(morph.current()[1]).toBeCloseTo(30);
    expect(morph.sample(true)).toEqual([50, 40]);
  });
});

describe("createGridMorph", () => {
  test("metric flip remaps stacked bars by relative height", () => {
    const morph = createGridMorph();
    morph.retarget([
      [1_000_000, 500_000],
      [800_000, 200_000],
    ]);
    morph.sample(true);

    morph.retarget([
      [10, 8],
      [4, 2],
    ]);
    const mid = morph.sample(false);
    // Old 2:1 mix at the new amplitude starts near [10, 5], not at zero.
    expect(mid[0]![0]!).toBeGreaterThan(8);
    expect(mid[0]![1]!).toBeGreaterThan(3);
    expect(mid[0]![1]!).toBeLessThan(7);
    expect(morph.sample(true)).toEqual([
      [10, 8],
      [4, 2],
    ]);
  });

  test("bar-count change remaps heights instead of growing from zero", () => {
    const morph = createGridMorph();
    morph.retarget([
      [100, 40],
      [80, 20],
    ]);
    morph.sample(true);
    morph.retarget([
      [100, 40],
      [90, 30],
      [80, 20],
      [70, 10],
    ]);
    const mid = morph.sample(false);
    expect(mid).toHaveLength(4);
    expect(mid[0]![0]!).toBeGreaterThan(20);
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

describe("remapSeriesLength", () => {
  test("keeps endpoints when stretching a series", () => {
    const remapped = remapSeriesLength([10, 20], 5);
    expect(remapped).toHaveLength(5);
    expect(remapped[0]).toBeCloseTo(10);
    expect(remapped[4]).toBeCloseTo(20);
  });
});
