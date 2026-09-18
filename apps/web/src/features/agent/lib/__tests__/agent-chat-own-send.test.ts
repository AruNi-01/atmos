import { describe, expect, it } from "bun:test";
import {
  OWN_SEND_GLIDE_RETAIN,
  OWN_SEND_TOP_INSET,
  firstSendInvertPx,
  ownSendGlideDone,
  ownSendPinScrollTop,
  ownSendRunwayOverflowed,
  ownSendRunwayPx,
  ownSendTopInset,
  ownSendViewportRoom,
  shouldRunOwnSendPin,
  stepOwnSendGlide,
} from "@/features/agent/lib/agent-chat-own-send";

describe("own send runway", () => {
  it("only pins later sends when the user is already following the tail", () => {
    expect(shouldRunOwnSendPin("first", false)).toBe(true);
    expect(shouldRunOwnSendPin("first", true)).toBe(true);
    expect(shouldRunOwnSendPin("follow", true)).toBe(true);
    expect(shouldRunOwnSendPin("follow", false)).toBe(false);
  });

  it("fills the leftover viewport under the prompt instead of a second page", () => {
    expect(ownSendViewportRoom(400, 80, 10)).toBe(310);
    expect(ownSendRunwayPx(400, 80, 10, 40)).toBe(270);
    expect(ownSendRunwayPx(400, 80, 10, 310)).toBe(0);
    expect(ownSendRunwayPx(400, 80, 10, 400)).toBe(0);
    expect(ownSendRunwayPx(0, 80)).toBe(0);
    expect(ownSendRunwayPx(-12, 80)).toBe(0);
  });

  it("inverts the first prompt from the viewport floor up to the top", () => {
    expect(firstSendInvertPx(400, 80)).toBe(320);
    expect(firstSendInvertPx(80, 80)).toBe(0);
    expect(firstSendInvertPx(80, 120)).toBe(0);
    expect(ownSendTopInset("first")).toBe(0);
    expect(ownSendTopInset("follow")).toBe(OWN_SEND_TOP_INSET);
  });

  it("pins later sends to the top inset and clamps to max scroll", () => {
    expect(ownSendPinScrollTop(40, 10, 800)).toBe(30);
    expect(ownSendPinScrollTop(4, 10, 800)).toBe(0);
    expect(ownSendPinScrollTop(900, 10, 200)).toBe(200);
    expect(ownSendPinScrollTop(40, 0, 0)).toBe(0);
  });

  it("eases toward the target and snaps when close", () => {
    const next = stepOwnSendGlide(100, 0);
    expect(next).toBe(100 * OWN_SEND_GLIDE_RETAIN);
    expect(ownSendGlideDone(next, 0)).toBe(false);
    expect(stepOwnSendGlide(0.2, 0)).toBe(0);
    expect(ownSendGlideDone(0, 0)).toBe(true);
  });

  it("drops the runway once the reply fills the pinned viewport", () => {
    expect(ownSendRunwayOverflowed(268, 400, 80, 10)).toBe(false);
    expect(ownSendRunwayOverflowed(310, 400, 80, 10)).toBe(true);
    expect(ownSendRunwayOverflowed(309.2, 400, 80, 10)).toBe(true);
  });
});
