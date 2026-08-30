import { describe, expect, test } from "bun:test";
import { nextStreamPrefix, takeStreamChars } from "./smooth-stream-text";

describe("takeStreamChars", () => {
  test("holds still when caught up", () => {
    expect(takeStreamChars(0, 16)).toEqual({ count: 0, remainder: 0 });
  });

  test("paces a small backlog near the base rate", () => {
    let remainder = 0;
    let revealed = 0;
    for (let i = 0; i < 63; i += 1) {
      const step = takeStreamChars(6, 16, remainder);
      revealed += step.count;
      remainder = step.remainder;
    }
    expect(revealed).toBeGreaterThanOrEqual(36);
    expect(revealed).toBeLessThanOrEqual(56);
  });

  test("drains a large backlog faster than the base rate", () => {
    const small = takeStreamChars(8, 16);
    const large = takeStreamChars(200, 16);
    expect(large.count).toBeGreaterThan(small.count);
    expect(large.count).toBeGreaterThan(20);
    expect(large.count).toBeLessThanOrEqual(200);
  });

  test("never reveals more than the backlog", () => {
    expect(takeStreamChars(3, 48).count).toBeLessThanOrEqual(3);
  });
});

describe("nextStreamPrefix", () => {
  test("appends whole code points in order", () => {
    expect(nextStreamPrefix("hello", "he", 2)).toBe("hell");
    expect(nextStreamPrefix("a😀b", "a", 1)).toBe("a😀");
  });

  test("snaps when the target is not a continuation", () => {
    expect(nextStreamPrefix("world", "he", 2)).toBe("world");
  });
});
