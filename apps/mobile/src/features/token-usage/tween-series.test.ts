// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
import { metricEase, morphSeries } from "./tween-series";

describe("morphSeries", () => {
  test("starts on the old silhouette scaled into the new peak", () => {
    expect(morphSeries([[0], [10]], [[4], [0]], 0)).toEqual([[0], [4]]);
  });

  test("ends on the target series", () => {
    const target = [[4], [0]];
    expect(morphSeries([[0], [10]], target, 1)).toBe(target);
  });

  test("meets in the middle of the normalized shapes", () => {
    const mid = morphSeries([[0], [10]], [[4], [0]], 0.5);
    const eased = metricEase(0.5);
    expect(mid[0]?.[0]).toBeCloseTo(4 * eased, 4);
    expect(mid[1]?.[0]).toBeCloseTo(4 * (1 - eased), 4);
  });

  test("grows or drops segments that only one side has", () => {
    const started = morphSeries([[10, 0]], [[0, 8, 2]], 0);
    expect(started[0]).toHaveLength(3);
    expect(started[0]?.[0]).toBeCloseTo(10, 4);
    expect(started[0]?.[2]).toBe(0);
  });
});
