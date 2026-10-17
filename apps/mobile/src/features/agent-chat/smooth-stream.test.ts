// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
import { takeStreamChars } from "./smooth-stream";

describe("takeStreamChars", () => {
  test("backlog 10 over a 48ms frame ramps near the base rate", () => {
    // seconds = 48/1000, t = 10/96, cps = 42 + t^2 * (260-42), count = floor(cps * seconds)
    expect(takeStreamChars(10, 48)).toEqual({
      count: 2,
      remainder: 0.12954166666666644,
    });
  });

  test("backlog 200 over a 16ms frame drains 14 percent", () => {
    // cps caps at 260, then backlog * 0.14 wins because 200 > 140
    expect(takeStreamChars(200, 16)).toEqual({
      count: 28,
      remainder: 200 * 0.14 - 28,
    });
  });
});
