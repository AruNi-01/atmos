// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
import { TRANSCRIPT_END_SLACK_PX } from "@atmos/agent-transcript";
import {
  offsetFromMeasuredStride,
  stickScrollWhileJumping,
  TRANSCRIPT_JUMP_FALLBACK_STRIDE,
} from "./transcript-jump";

describe("stickScrollWhileJumping", () => {
  test("a normal scroll keeps the caller's drag flag", () => {
    expect(stickScrollWhileJumping(400, false, false)).toEqual({
      distance: 400,
      userDragged: false,
    });
    expect(stickScrollWhileJumping(0, false, true)).toEqual({ distance: 0, userDragged: true });
  });

  test("an in-flight jump ignores a stale end position", () => {
    expect(stickScrollWhileJumping(0, true, false)).toBe("ignore");
    expect(stickScrollWhileJumping(TRANSCRIPT_END_SLACK_PX, true, false)).toBe("ignore");
  });

  test("a jump past the slack lets go of the end", () => {
    expect(stickScrollWhileJumping(TRANSCRIPT_END_SLACK_PX + 1, true, false)).toEqual({
      distance: TRANSCRIPT_END_SLACK_PX + 1,
      userDragged: true,
    });
  });
});

describe("offsetFromMeasuredStride", () => {
  test("uses the fallback stride before any row is measured", () => {
    expect(offsetFromMeasuredStride(99, [], 12)).toBe(99 * TRANSCRIPT_JUMP_FALLBACK_STRIDE);
    expect(offsetFromMeasuredStride(0, [], 12)).toBe(0);
  });

  test("uses the measured row size plus the list gap", () => {
    expect(offsetFromMeasuredStride(10, [{ size: 40 }, undefined, { size: 0 }], 12)).toBe(520);
  });
});
