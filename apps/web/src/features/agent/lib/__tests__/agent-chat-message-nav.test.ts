import { describe, expect, it } from "bun:test";
import {
  resolveActiveUserMessageIndex,
  userMessageRectsFromMeasurements,
} from "../agent-chat-message-nav";

describe("resolveActiveUserMessageIndex", () => {
  it("follows the last user message that intersects the viewport", () => {
    expect(resolveActiveUserMessageIndex(
      [
        { messageIndex: 0, top: -200, bottom: -40 },
        { messageIndex: 2, top: 320, bottom: 400 },
        { messageIndex: 4, top: 430, bottom: 510 },
      ],
      { height: 600, scrollTop: 800, scrollHeight: 1800 },
    )).toBe(4);
  });

  it("sticks to the last user message when the transcript is scrolled to the bottom", () => {
    expect(resolveActiveUserMessageIndex(
      [
        { messageIndex: 0, top: -900, bottom: -820 },
        { messageIndex: 2, top: 360, bottom: 430 },
        { messageIndex: 4, top: 470, bottom: 540 },
      ],
      { height: 600, scrollTop: 1190, scrollHeight: 1800 },
    )).toBe(4);
  });

  it("keeps the earlier user prompt while its turn still fills the viewport", () => {
    expect(resolveActiveUserMessageIndex(
      [
        { messageIndex: 0, top: 24, bottom: 80 },
        { messageIndex: 2, top: 720, bottom: 780 },
      ],
      { height: 600, scrollTop: 0, scrollHeight: 1400 },
    )).toBe(0);
  });

  it("keeps the last passed prompt when the viewport sits in that turn", () => {
    expect(resolveActiveUserMessageIndex(
      [
        { messageIndex: 0, top: -520, bottom: -440 },
        { messageIndex: 2, top: 720, bottom: 790 },
      ],
      { height: 600, scrollTop: 400, scrollHeight: 1600 },
    )).toBe(0);
  });

  it("does not jump to the first prompt after leaving the bottom of a long last reply", () => {
    expect(resolveActiveUserMessageIndex(
      [
        { messageIndex: 0, top: -1500, bottom: -1420 },
        { messageIndex: 2, top: -980, bottom: -900 },
        { messageIndex: 4, top: -460, bottom: -380 },
        { messageIndex: 6, top: -90, bottom: -20 },
      ],
      { height: 600, scrollTop: 1180, scrollHeight: 1800 },
    )).toBe(6);
  });
});

describe("userMessageRectsFromMeasurements", () => {
  it("maps cached virtual items into viewport-relative rects", () => {
    expect(userMessageRectsFromMeasurements(
      [0, 2, 4],
      [
        { start: 16, size: 80 },
        { start: 108, size: 240 },
        { start: 360, size: 72 },
        { start: 444, size: 200 },
        { start: 656, size: 88 },
      ],
      320,
    )).toEqual([
      { messageIndex: 0, top: -304, bottom: -224 },
      { messageIndex: 2, top: 40, bottom: 112 },
      { messageIndex: 4, top: 336, bottom: 424 },
    ]);
  });

  it("skips user rows the virtualizer has not measured yet", () => {
    expect(userMessageRectsFromMeasurements([0, 2], [{ start: 0, size: 80 }], 0)).toEqual([
      { messageIndex: 0, top: 0, bottom: 80 },
    ]);
  });
});
