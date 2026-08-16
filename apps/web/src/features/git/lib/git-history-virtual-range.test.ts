import { describe, expect, test } from "bun:test";
import {
  gitHistoryRowScrollTop,
  visibleGitHistoryRowRange,
} from "./git-history-virtual-range";

describe("git history virtual range", () => {
  test("windows rows with overscan", () => {
    expect(visibleGitHistoryRowRange(0, 360, 1000, 36, 2)).toEqual({
      start: 0,
      end: 12,
    });
    expect(visibleGitHistoryRowRange(360, 360, 1000, 36, 2)).toEqual({
      start: 8,
      end: 22,
    });
  });

  test("clamps to the list bounds", () => {
    expect(visibleGitHistoryRowRange(0, 100, 0, 36)).toEqual({ start: 0, end: 0 });
    expect(visibleGitHistoryRowRange(50_000, 360, 20, 36, 2)).toEqual({
      start: 20,
      end: 20,
    });
  });

  test("centers a row in the viewport", () => {
    expect(gitHistoryRowScrollTop(0, 36, 360)).toBe(0);
    expect(gitHistoryRowScrollTop(10, 36, 360)).toBe(10 * 36 - (360 - 36) / 2);
  });
});
