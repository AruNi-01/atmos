import { describe, expect, it } from "bun:test";
import {
  nextUserMessageIndex,
  previousUserMessageIndex,
  resolveActiveUserMessageIndex,
  resolveStickyOverlayIndex,
  resolveStickyUserMessageIndex,
  shouldHideStickyUserFade,
  shouldPinStickyUserMessage,
  stepUserMessageIndex,
  stickyUserMessagePushPx,
  stickyUserPinLayout,
  stickyUserTranslateY,
  TIMELINE_RAIL_ITEM_SIZE_MAX,
  TIMELINE_RAIL_ITEM_SIZE_MIN,
  timelineRailItemSize,
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

describe("previousUserMessageIndex", () => {
  it("returns the preceding user prompt or null at the start", () => {
    expect(previousUserMessageIndex([0, 2, 4], 2)).toBe(0);
    expect(previousUserMessageIndex([0, 2, 4], 0)).toBeNull();
    expect(previousUserMessageIndex([0, 2, 4], 1)).toBeNull();
  });
});

describe("stepUserMessageIndex", () => {
  it("steps from the active user prompt", () => {
    expect(stepUserMessageIndex([0, 2, 4], 2, "previous")).toBe(0);
    expect(stepUserMessageIndex([0, 2, 4], 2, "next")).toBe(4);
  });

  it("disables the ends", () => {
    expect(stepUserMessageIndex([0, 2, 4], 0, "previous")).toBeNull();
    expect(stepUserMessageIndex([0, 2, 4], 4, "next")).toBeNull();
  });

  it("treats an unsynced current as the last prompt", () => {
    expect(stepUserMessageIndex([0, 2, 4], -1, "previous")).toBe(2);
    expect(stepUserMessageIndex([0, 2, 4], -1, "next")).toBeNull();
  });

  it("returns null when there are no user prompts", () => {
    expect(stepUserMessageIndex([], -1, "previous")).toBeNull();
    expect(stepUserMessageIndex([], 0, "next")).toBeNull();
  });
});

describe("timelineRailItemSize", () => {
  it("keeps the default stride until the rail would exceed half the column", () => {
    expect(timelineRailItemSize(10, 800)).toBe(TIMELINE_RAIL_ITEM_SIZE_MAX);
    expect(timelineRailItemSize(28, 800)).toBe(TIMELINE_RAIL_ITEM_SIZE_MAX);
    expect(28 * TIMELINE_RAIL_ITEM_SIZE_MAX).toBeLessThanOrEqual(400);
  });

  it("starts compressing only slightly once the uncompressed rail would pass 50%", () => {
    const size = timelineRailItemSize(29, 800);
    expect(size).toBeLessThan(TIMELINE_RAIL_ITEM_SIZE_MAX);
    expect(size).toBeGreaterThan(13);
    expect(size * 29).toBeGreaterThan(400);
    expect(size * 29).toBeLessThanOrEqual(720);
  });

  it("shrinks spacing gradually as count grows instead of jumping to 0.5px", () => {
    const a = timelineRailItemSize(40, 800);
    const b = timelineRailItemSize(80, 800);
    const c = timelineRailItemSize(200, 800);
    expect(a).toBeGreaterThan(b);
    expect(b).toBeGreaterThan(c);
    expect(a).toBeGreaterThan(12);
    expect(b).toBeGreaterThan(8);
    expect(c).toBeGreaterThan(2);
    expect(c).toBeGreaterThan(TIMELINE_RAIL_ITEM_SIZE_MIN);
  });

  it("reaches 0.5px only when that spacing would fill 90%", () => {
    expect(timelineRailItemSize(200, 800)).toBeGreaterThan(2);
    expect(timelineRailItemSize(1440, 800)).toBeCloseTo(TIMELINE_RAIL_ITEM_SIZE_MIN);
  });

  it("does not let the rail grow past 90%", () => {
    for (const count of [40, 80, 200, 800, 2000]) {
      expect(timelineRailItemSize(count, 800) * count).toBeLessThanOrEqual(720 + 1e-6);
    }
  });

  it("keeps the rail at 90% if 0.5px spacing would overflow", () => {
    const size = timelineRailItemSize(4000, 800);
    expect(size * 4000).toBeCloseTo(720);
    expect(size).toBeLessThan(TIMELINE_RAIL_ITEM_SIZE_MIN);
  });

  it("reserves step-button chrome out of the 90% budget", () => {
    const size = timelineRailItemSize(4000, 400, 72);
    expect(size * 4000).toBeCloseTo(400 - 72);
  });

  it("returns the default stride when the column has not been measured", () => {
    expect(timelineRailItemSize(80, 0)).toBe(TIMELINE_RAIL_ITEM_SIZE_MAX);
    expect(timelineRailItemSize(0, 800)).toBe(TIMELINE_RAIL_ITEM_SIZE_MAX);
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
    expect(stickyUserMessagePushPx(92, 80, 12)).toBe(0);
  });

  it("pushes the sticky header up as the next prompt arrives", () => {
    expect(stickyUserMessagePushPx(50, 80)).toBe(-30);
  });

  it("starts pushing a gap earlier so the two user bubbles do not kiss", () => {
    expect(stickyUserMessagePushPx(80, 80, 12)).toBe(-12);
    expect(stickyUserMessagePushPx(50, 80, 12)).toBe(-42);
  });
});

describe("stickyUserTranslateY", () => {
  it("pins at the scrollport while the next prompt is still below", () => {
    expect(stickyUserTranslateY(200, 16, 80, 520, 12)).toBe(184);
    expect(stickyUserTranslateY(200, 16, 80, null, 12)).toBe(184);
  });

  it("pushes by the overlap once the next prompt reaches the pinned height", () => {
    expect(stickyUserTranslateY(450, 16, 80, 520, 12)).toBe(412);
  });

  it("tracks the natural row offset for adjacent user prompts during the push", () => {
    const start = 16;
    const size = 80;
    const gap = 12;
    const scrollMargin = 16;
    const nextStart = start + size + gap;
    const natural = start - scrollMargin;
    for (const scrollTop of [16, 40, 70, 100, 108]) {
      expect(stickyUserTranslateY(scrollTop, scrollMargin, size, nextStart, gap)).toBe(natural);
    }
  });
});

describe("stickyUserPinLayout", () => {
  it("hides the fade once the next prompt would enter it", () => {
    expect(stickyUserPinLayout(200, 16, 80, 520, 12, 0, 32)).toEqual({
      translateY: 184,
      hideFade: false,
    });
    expect(stickyUserPinLayout(450, 16, 80, 520, 12, 0, 32)).toEqual({
      translateY: 412,
      hideFade: true,
    });
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
