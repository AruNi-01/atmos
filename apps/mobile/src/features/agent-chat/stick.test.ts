// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { readFileSync } from "node:fs";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { dirname, join } from "node:path";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { fileURLToPath } from "node:url";
import { TRANSCRIPT_END_SLACK_PX } from "@atmos/agent-transcript";
import { copy } from "./copy";
import {
  composerRowVisible,
  initialStickState,
  reduceStick,
  scrollBelowSentence,
  scrollPillAccessibilityLabel,
  scrollPillVisible,
  type StickState,
} from "./stick";

const here = dirname(fileURLToPath(import.meta.url));

describe("reduceStick", () => {
  test("the end slack is the shared 24px threshold", () => {
    expect(TRANSCRIPT_END_SLACK_PX).toBe(24);
  });

  test("starts stuck to the end", () => {
    expect(initialStickState).toEqual({ stickToEnd: true });
  });

  test("a drag past the slack lets go of the end", () => {
    const next = reduceStick(initialStickState, {
      type: "scroll",
      distance: TRANSCRIPT_END_SLACK_PX + 1,
      userDragged: true,
    });
    expect(next.stickToEnd).toBe(false);
  });

  test("landing inside the slack sticks again", () => {
    const away: StickState = { stickToEnd: false };
    expect(
      reduceStick(away, {
        type: "scroll",
        distance: TRANSCRIPT_END_SLACK_PX,
        userDragged: true,
      }).stickToEnd,
    ).toBe(true);
    expect(
      reduceStick(initialStickState, {
        type: "scroll",
        distance: 0,
        userDragged: false,
      }).stickToEnd,
    ).toBe(true);
  });

  test("distance past the slack without a drag does not let go", () => {
    expect(
      reduceStick(initialStickState, {
        type: "scroll",
        distance: 400,
        userDragged: false,
      }),
    ).toBe(initialStickState);
  });

  test("an own send sticks", () => {
    expect(reduceStick({ stickToEnd: false }, { type: "own_send" }).stickToEnd).toBe(true);
    expect(reduceStick(initialStickState, { type: "own_send" })).toBe(initialStickState);
  });

  test("content growth does not stick again by itself", () => {
    const away: StickState = { stickToEnd: false };
    expect(reduceStick(away, { type: "content_growth" })).toBe(away);
    const stillAway = reduceStick(away, {
      type: "scroll",
      distance: 800,
      userDragged: false,
    });
    expect(stillAway.stickToEnd).toBe(false);
  });
});

describe("scroll pill rules", () => {
  test("the label matches the web scrollBelow sentence", () => {
    expect(copy.scrollBelowPrefix).toBe("");
    expect(scrollBelowSentence(1)).toBe("1 message below");
    expect(scrollBelowSentence(3)).toBe("3 messages below");
    expect(scrollPillAccessibilityLabel(3)).toBe("3 messages below");
    expect(scrollPillAccessibilityLabel(0)).toBe("Bottom");
  });

  test("the pill and the row follow message count, stick, and cards", () => {
    expect(scrollPillVisible(0, true)).toBe(false);
    expect(composerRowVisible(false, 0)).toBe(false);

    expect(scrollPillVisible(5, true)).toBe(false);
    expect(composerRowVisible(false, 0)).toBe(false);

    expect(scrollPillVisible(5, true)).toBe(false);
    expect(composerRowVisible(false, 2)).toBe(true);

    expect(scrollPillVisible(50, false)).toBe(true);
    expect(scrollBelowSentence(3)).toBe("3 messages below");
    expect(composerRowVisible(true, 0)).toBe(true);

    expect(scrollPillVisible(50, false)).toBe(true);
    expect(scrollPillAccessibilityLabel(0)).toBe(copy.bottom);
    expect(composerRowVisible(true, 0)).toBe(true);

    expect(scrollPillVisible(50, false)).toBe(true);
    expect(composerRowVisible(true, 2)).toBe(true);
  });
});

describe("transcript stick wiring", () => {
  test("the list uses the reducer, sticks only while at the end, and anchors when reading up", () => {
    const transcript = readFileSync(join(here, "AgentChatTranscript.tsx"), "utf8");
    expect(transcript).not.toContain("BOTTOM_SLOP");
    expect(transcript).toContain("reduceStick");
    expect(transcript).toContain('type: "content_growth"');
    expect(transcript).toContain('type: "own_send"');
    expect(transcript).toContain("if (!stickRef.current.stickToEnd) return;");
    expect(transcript).toContain("maintainVisibleContentPosition");
    expect(transcript).toContain("minIndexForVisible: 0");
    expect(transcript).toContain("autoscrollToTopThreshold: 10");
    expect(transcript).toContain("stickToEnd ? undefined");
    expect(transcript).toContain("countMessagesBelowViewport");
    expect(transcript).toContain("stickToken");
    expect(transcript).toContain("stickScrollWhileJumping");
    expect(transcript).toContain("offsetFromMeasuredStride");
  });

  test("the thread flips stick when a send starts and hosts the pill row above the composer", () => {
    const screen = readFileSync(join(here, "AgentChatThreadScreen.tsx"), "utf8");
    expect(screen).toContain("setStickToken");
    expect(screen).toContain("ComposerPillRow");
    expect(screen).toContain("expandedCardHeight={0}");
    expect(screen).toContain("pillRowHeight=");
    const sendAt = screen.indexOf("const onSend = useCallback");
    const tokenAt = screen.indexOf("setStickToken", sendAt);
    const asyncAt = screen.indexOf("void (async ()", sendAt);
    expect(sendAt).toBeGreaterThan(-1);
    expect(tokenAt).toBeGreaterThan(sendAt);
    expect(asyncAt).toBeGreaterThan(tokenAt);
  });
});
