import { describe, expect, test } from "bun:test";
import { mdLiveTableAtScrollEnd } from "./table-ops";

describe("mdLiveTableAtScrollEnd", () => {
  test("a table that fits is already at the end", () => {
    expect(mdLiveTableAtScrollEnd(0, 640, 640)).toBe(true);
  });

  test("hidden trailing columns are not at the end", () => {
    expect(mdLiveTableAtScrollEnd(0, 640, 1200)).toBe(false);
    expect(mdLiveTableAtScrollEnd(200, 640, 1200)).toBe(false);
  });

  test("scrolling to the right edge counts as the end", () => {
    expect(mdLiveTableAtScrollEnd(560, 640, 1200)).toBe(true);
    expect(mdLiveTableAtScrollEnd(552, 640, 1200)).toBe(true);
  });
});
