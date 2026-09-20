import { describe, expect, test } from "bun:test";
import {
  resolveStreamdownAnimated,
  STREAMDOWN_STREAM_ANIMATION,
} from "./streamdown-animation";

describe("resolveStreamdownAnimated", () => {
  test("uses character-level defaults only when explicitly enabled", () => {
    expect(resolveStreamdownAnimated(undefined, false)).toBe(false);
    expect(resolveStreamdownAnimated(true, false)).toEqual(STREAMDOWN_STREAM_ANIMATION);
    expect(STREAMDOWN_STREAM_ANIMATION.sep).toBe("char");
  });

  test("stays off for reduced motion and explicit false", () => {
    expect(resolveStreamdownAnimated(true, true)).toBe(false);
    expect(resolveStreamdownAnimated(STREAMDOWN_STREAM_ANIMATION, true)).toBe(false);
    expect(resolveStreamdownAnimated(false, false)).toBe(false);
  });

  test("lets callers override individual options", () => {
    expect(resolveStreamdownAnimated({ stagger: 8 }, false)).toEqual({
      ...STREAMDOWN_STREAM_ANIMATION,
      stagger: 8,
    });
  });
});
