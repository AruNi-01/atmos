import { describe, expect, it } from "bun:test";
import {
  nextUserMessageIndex,
  resolveActiveUserMessageIndex,
  resolveStickyOverlayIndex,
  resolveStickyUserMessageIndex,
  shouldHideStickyUserFade,
  shouldPinStickyUserMessage,
  stickyUserMessagePushPx,
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

describe("resolveStickyUserMessageIndex", () => {
  const measurements = [
    { start: 16, size: 80 },
    { start: 108, size: 400 },
    { start: 520, size: 80 },
    { start: 612, size: 400 },
    { start: 1024, size: 80 },
  ];

  it("pins the last user prompt whose natural top has reached the scrollport", () => {
    expect(resolveStickyUserMessageIndex([0, 2, 4], measurements, 16)).toBe(0);
    expect(resolveStickyUserMessageIndex([0, 2, 4], measurements, 400)).toBe(0);
    expect(resolveStickyUserMessageIndex([0, 2, 4], measurements, 520)).toBe(2);
    expect(resolveStickyUserMessageIndex([0, 2, 4], measurements, 2000)).toBe(4);
  });

  it("returns null until a user prompt has reached the top", () => {
    expect(resolveStickyUserMessageIndex([0, 2, 4], measurements, 0)).toBeNull();
    expect(resolveStickyUserMessageIndex([2, 4], measurements, 16)).toBeNull();
    expect(resolveStickyUserMessageIndex([], measurements, 100)).toBeNull();
  });
});

describe("shouldPinStickyUserMessage", () => {
  it("waits until the original row has left the top before cloning it", () => {
    expect(shouldPinStickyUserMessage(520, 520)).toBe(false);
    expect(shouldPinStickyUserMessage(520, 521)).toBe(false);
    expect(shouldPinStickyUserMessage(520, 600)).toBe(true);
  });
});

describe("resolveStickyOverlayIndex", () => {
  const measurements = [
    { start: 16, size: 80 },
    { start: 108, size: 400 },
    { start: 520, size: 80 },
    { start: 612, size: 400 },
  ];

  it("does not clone the prompt that is still sitting at the top", () => {
    expect(resolveStickyOverlayIndex([0, 2], measurements, 520)).toBeNull();
    expect(resolveStickyOverlayIndex([0, 2], measurements, 521)).toBeNull();
  });

  it("pins the current prompt only after its original row has left the top", () => {
    expect(resolveStickyOverlayIndex([0, 2], measurements, 400)).toBe(0);
    expect(resolveStickyOverlayIndex([0, 2], measurements, 600)).toBe(2);
  });
});

describe("nextUserMessageIndex", () => {
  it("returns the following user prompt or null at the end", () => {
    expect(nextUserMessageIndex([0, 2, 4], 2)).toBe(4);
    expect(nextUserMessageIndex([0, 2, 4], 4)).toBeNull();
    expect(nextUserMessageIndex([0, 2, 4], 1)).toBeNull();
  });
});

describe("shouldHideStickyUserFade", () => {
  it("hides the fade before the next user prompt enters it", () => {
    expect(shouldHideStickyUserFade(200, 80, 32)).toBe(false);
    expect(shouldHideStickyUserFade(100, 80, 32)).toBe(true);
    expect(shouldHideStickyUserFade(80, 80, 32)).toBe(true);
  });
});

describe("stickyUserMessagePushPx", () => {
  it("stays put while the next prompt is still below the sticky header", () => {
    expect(stickyUserMessagePushPx(120, 80)).toBe(0);
  });

  it("pushes the sticky header up as the next prompt arrives", () => {
    expect(stickyUserMessagePushPx(50, 80)).toBe(-30);
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
