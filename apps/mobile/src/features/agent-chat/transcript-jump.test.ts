// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
import { TRANSCRIPT_END_SLACK_PX } from "@atmos/agent-transcript";
import {
  jumpExtendReadyToRelease,
  jumpFollowsTailAfterMiss,
  jumpHasTailRoom,
  offsetFromMeasuredStride,
  stickScrollWhileJumping,
  transcriptItemLayout,
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

describe("jumpFollowsTailAfterMiss", () => {
  test("an earlier row stays put when the jump is still clamped to the end", () => {
    expect(jumpFollowsTailAfterMiss(50, 120)).toBe(false);
    expect(jumpFollowsTailAfterMiss(119, 120)).toBe(true);
    expect(jumpFollowsTailAfterMiss(0, 0)).toBe(true);
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

describe("transcriptItemLayout", () => {
  test("uses the short fallback before any row is measured", () => {
    expect(transcriptItemLayout(99, [], 12)).toEqual({
      index: 99,
      length: TRANSCRIPT_JUMP_FALLBACK_STRIDE,
      offset: 99 * TRANSCRIPT_JUMP_FALLBACK_STRIDE,
    });
  });

  test("keeps a measured row and continues later rows from its bottom", () => {
    const measurements = [{ size: 40, start: 16 }];
    expect(transcriptItemLayout(0, measurements, 12)).toEqual({ index: 0, length: 40, offset: 16 });
    expect(transcriptItemLayout(3, measurements, 12)).toEqual({
      index: 3,
      length: 40,
      offset: 172,
    });
  });
});

describe("jumpHasTailRoom", () => {
  test("waits until measured rows below the target cover the viewport and the slack", () => {
    const short = [{ size: 20 }, { size: 100 }];
    expect(jumpHasTailRoom(0, short, 100, 12)).toBe(false);
    expect(jumpHasTailRoom(0, [{ size: 20 }, { size: 200 }], 100, 12)).toBe(true);
    expect(jumpHasTailRoom(0, [{ size: 20 }, undefined, { size: 400 }], 100, 12)).toBe(false);
  });
});

describe("jumpExtendReadyToRelease", () => {
  test("a top offset does not release while the marker is still far below", () => {
    const measurements: Array<{ size: number; start: number } | undefined> = [];
    measurements[50] = { size: 40, start: 4434 };
    measurements[51] = { size: 800, start: 4486 };
    expect(jumpHasTailRoom(50, measurements, 668, 12)).toBe(true);
    expect(jumpExtendReadyToRelease(50, measurements, 668, 12, 10)).toBe(false);
    expect(jumpExtendReadyToRelease(50, measurements, 668, 12, 4434)).toBe(true);
    expect(jumpExtendReadyToRelease(50, measurements, 668, 12, 4436)).toBe(true);
    expect(jumpExtendReadyToRelease(50, measurements, 668, 12, 4437)).toBe(false);
  });

  test("a matching offset still waits for a measured tail", () => {
    const measurements = [
      { size: 40, start: 0 },
      { size: 20, start: 52 },
    ];
    expect(jumpExtendReadyToRelease(0, measurements, 100, 12, 0)).toBe(false);
  });
});
