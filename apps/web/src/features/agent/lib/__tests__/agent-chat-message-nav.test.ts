import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  nextUserMessageIndex,
  previousUserMessageIndex,
  resolveActiveUserMessageIndex,
  stepUserMessageIndex,
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

  it("steps from the catalog item even when two prompts would share a viewport", () => {
    expect(stepUserMessageIndex([0, 2], 0, "next")).toBe(2);
    expect(stepUserMessageIndex([0, 2], 2, "previous")).toBe(0);
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

const timelineNav = readFileSync(
  join(import.meta.dir, "../../components/AgentMessageTimelineNav.tsx"),
  "utf8",
);
const transcriptList = readFileSync(
  join(import.meta.dir, "../../components/AgentChatTranscriptList.tsx"),
  "utf8",
);
const panel = readFileSync(
  join(import.meta.dir, "../../components/AgentChatPanel.tsx"),
  "utf8",
);

describe("AgentMessageTimelineNav", () => {
  it("uses the shared tooltip and only fills the step buttons on hover", () => {
    expect(timelineNav).toContain("TooltipProvider");
    expect(timelineNav).toContain("TooltipTrigger");
    expect(timelineNav).toContain("TooltipContent");
    expect(timelineNav).toContain("hover:bg-muted");
    expect(timelineNav).toContain("const TIMELINE_STEP_BUTTON_PX = 24");
    expect(timelineNav).toContain("inline-flex size-6 items-center justify-center rounded-full");
    expect(timelineNav).not.toContain("bg-muted/75");
    expect(timelineNav).not.toContain("group/timeline-step");
    expect(timelineNav).not.toContain("group-hover/timeline-step:flex");
  });

  it("centers rail ticks under the previous/next step buttons", () => {
    expect(timelineNav).toContain("[&_[data-slot=preview-rail-item]]:justify-center");
    expect(timelineNav).not.toContain("justify-start");
  });

  it("expands hovered ticks right from a fixed left edge", () => {
    expect(timelineNav).toContain("[&_[data-slot=preview-rail-tick]]:!origin-left");
    expect(timelineNav).not.toContain("origin-center");
    expect(timelineNav).not.toContain("origin-right");
  });

  it("steps previous/next from the highlighted catalog item", () => {
    expect(timelineNav).toContain("const catalogIndex = activeItem?.messageIndex ?? activeMessageIndex");
    expect(timelineNav).toContain("registryId={activeAgent.id}");
    expect(timelineNav).toContain('<Bot className="size-4" />');
  });
});

describe("timeline message scroll", () => {
  it("unlocks stick-to-bottom and scrolls the selected catalog item into place", () => {
    expect(transcriptList).toContain("stopStickRef.current?.()");
    expect(transcriptList).toContain("measurement.start - virtualizer.options.scrollMargin");
    expect(transcriptList).toContain("onUserScrollIntent");
    expect(panel).toContain("handleSelectTimelineMessage");
    expect(panel).toContain("timelineNavLockedRef.current = true");
    expect(panel).toContain("onActiveUserMessage={handleActiveTimelineMessage}");
    expect(panel).toContain("onUserScrollIntent={releaseTimelineNavLock}");
  });
});
