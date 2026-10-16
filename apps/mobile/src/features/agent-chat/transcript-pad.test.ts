// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
import { AGENT_CHAT_TRANSCRIPT_BASE_BOTTOM_PAD_PX } from "@atmos/agent-transcript";
import {
  resolvedPillRowHeight,
  TRANSCRIPT_PAD_SHRINK_MS,
  transcriptListBottomPad,
  transcriptPadEasingMatchesShared,
  transcriptPadShouldEase,
} from "./transcript-pad";

describe("transcript bottom pad", () => {
  test("pad is 40 plus the expanded card and the pill row", () => {
    expect(AGENT_CHAT_TRANSCRIPT_BASE_BOTTOM_PAD_PX).toBe(40);
    expect(transcriptListBottomPad(0, 0)).toBe(40);
    expect(transcriptListBottomPad(0, 36)).toBe(76);
    expect(transcriptListBottomPad(120, 36)).toBe(196);
  });

  test("a hidden row contributes no height", () => {
    expect(resolvedPillRowHeight(false, 36)).toBe(0);
    expect(transcriptListBottomPad(80, resolvedPillRowHeight(false, 36))).toBe(120);
    expect(transcriptListBottomPad(80, resolvedPillRowHeight(true, 36))).toBe(156);
  });

  test("shrink eases over 350ms and reduced motion snaps", () => {
    expect(TRANSCRIPT_PAD_SHRINK_MS).toBe(350);
    expect(transcriptPadEasingMatchesShared()).toBe(true);
    expect(transcriptPadShouldEase(196, 40, false)).toBe(true);
    expect(transcriptPadShouldEase(40, 196, false)).toBe(false);
    expect(transcriptPadShouldEase(80, 80, false)).toBe(false);
    expect(transcriptPadShouldEase(196, 40, true)).toBe(false);
  });
});
