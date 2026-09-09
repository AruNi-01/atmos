// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { afterEach, describe, expect, it } from "bun:test";

import {
  __resetComposerPasteForTests,
  PASTE_LINE_THRESHOLD,
  USER_MESSAGE_COLLAPSE_LINES,
  buildPastePreview,
  collapsedUserMessageText,
  countPasteLines,
  displayTextForSentMessage,
  expandPasteTokens,
  parsePasteToken,
  registerComposerPaste,
  resolveComposerPaste,
  sentMessageHasPasteChips,
  shouldChipPlainPaste,
  splitComposerDisplaySegments,
  userMessageNeedsCollapse,
} from "../composer-paste";

afterEach(() => {
  __resetComposerPasteForTests();
});

function lines(count: number, prefix = "line"): string {
  return Array.from({ length: count }, (_, i) => `${prefix} ${i + 1}`).join("\n");
}

describe("composer paste protocol", () => {
  it("chips pastes over the line threshold and leaves shorter pastes as text", () => {
    expect(shouldChipPlainPaste(lines(PASTE_LINE_THRESHOLD))).toBe(false);
    expect(shouldChipPlainPaste(lines(PASTE_LINE_THRESHOLD + 1))).toBe(true);
    expect(countPasteLines(`${lines(12)}\n`)).toBe(12);
  });

  it("registers a token that expands back to the exact body", () => {
    const body = lines(16);
    const token = registerComposerPaste(body);
    expect(parsePasteToken(token)).toBeTruthy();
    expect(resolveComposerPaste(token)).toEqual({ text: body, lineCount: 16 });
    expect(expandPasteTokens(`please review\n${token}\nthanks`)).toBe(
      `please review\n${body}\nthanks`,
    );
  });

  it("remembers chip display for a message sent while still chipped", () => {
    const body = lines(20);
    const token = registerComposerPaste(body);
    const composerText = `check this ${token}`;
    const expanded = expandPasteTokens(composerText);
    expect(expanded).toBe(`check this ${body}`);
    expect(displayTextForSentMessage(expanded)).toBe(composerText);
    expect(sentMessageHasPasteChips(expanded)).toBe(true);
    const segments = splitComposerDisplaySegments(displayTextForSentMessage(expanded));
    expect(segments).toEqual([
      { type: "text", value: "check this " },
      { type: "paste", token, text: body, lineCount: 20 },
    ]);
  });

  it("builds a head/tail preview with a dimmer more-lines gap", () => {
    const preview = buildPastePreview(lines(11));
    expect(preview.head).toEqual(["line 1", "line 2", "line 3"]);
    expect(preview.more).toBe(5);
    expect(preview.tail).toEqual(["line 9", "line 10", "line 11"]);
  });

  it("collapses non-chip user messages over five lines", () => {
    const body = lines(8);
    expect(userMessageNeedsCollapse(body)).toBe(true);
    expect(collapsedUserMessageText(body).split("\n")).toHaveLength(
      USER_MESSAGE_COLLAPSE_LINES,
    );
    const token = registerComposerPaste(lines(20));
    expandPasteTokens(token);
    expect(userMessageNeedsCollapse(lines(20))).toBe(false);
  });
});
