// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { readFileSync } from "node:fs";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { dirname, join } from "node:path";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { fileURLToPath } from "node:url";
import { AGENT_CHAT_TRANSCRIPT_BASE_BOTTOM_PAD_PX } from "@atmos/agent-transcript";
import {
  resolvedPillRowHeight,
  TRANSCRIPT_PAD_SHRINK_MS,
  transcriptContentEndOffset,
  transcriptListBottomPad,
  transcriptPadEasingMatchesShared,
  transcriptPadShouldEase,
} from "./transcript-pad";

const here = dirname(fileURLToPath(import.meta.url));

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

  test("the end offset includes the bottom pad that scrollToEnd leaves below the viewport", () => {
    expect(transcriptContentEndOffset(0, 668)).toBe(0);
    expect(transcriptContentEndOffset(10_000, 0)).toBe(0);
    expect(transcriptContentEndOffset(-4, 668)).toBe(0);
    const viewport = 668;
    const content = 10_000;
    const pad = transcriptListBottomPad(0, 0) + 16;
    expect(pad).toBe(AGENT_CHAT_TRANSCRIPT_BASE_BOTTOM_PAD_PX + 16);
    const cellEnd = content - pad - viewport;
    const end = transcriptContentEndOffset(content, viewport);
    expect(end - cellEnd).toBe(pad);
    expect(content - viewport - end).toBe(0);
    expect(transcriptContentEndOffset(400, viewport)).toBe(0);
  });

  test("the transcript uses that offset and falls back to scrollToEnd only while a size is unknown", () => {
    const transcript = readFileSync(join(here, "AgentChatTranscript.tsx"), "utf8");
    expect(transcript).toContain("transcriptContentEndOffset");
    expect(transcript).toContain("contentHeightRef.current = height");
    expect(transcript.match(/scrollToEnd\(\{/g)).toHaveLength(1);
  });
});
