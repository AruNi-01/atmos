import { describe, expect, it } from "bun:test";
import { COMPOSER_DOCK_MS } from "@/features/agent/lib/agent-chat-composer-dock";
import {
  OWN_SEND_DRAFT_KEY,
  OWN_SEND_FOLLOW_MIN_INVERT,
  OWN_SEND_FOLLOW_MS,
  ownSendDurationMs,
  ownSendInvertPx,
  shouldAnimateOwnSend,
  shouldResetOwnSend,
} from "@/features/agent/lib/agent-chat-own-send";

describe("own send animation", () => {
  it("always plays the first send and only follows later sends at the tail", () => {
    expect(shouldAnimateOwnSend("first", false)).toBe(true);
    expect(shouldAnimateOwnSend("first", true)).toBe(true);
    expect(shouldAnimateOwnSend("follow", true)).toBe(true);
    expect(shouldAnimateOwnSend("follow", false)).toBe(false);
  });

  it("keeps the pending first send across draft → created chat id", () => {
    expect(shouldResetOwnSend(OWN_SEND_DRAFT_KEY, OWN_SEND_DRAFT_KEY)).toBe(false);
    expect(shouldResetOwnSend(OWN_SEND_DRAFT_KEY, "chat-1")).toBe(false);
    expect(shouldResetOwnSend("chat-1", "chat-2")).toBe(true);
    expect(shouldResetOwnSend("chat-1", OWN_SEND_DRAFT_KEY)).toBe(true);
  });

  it("inverts from the composer origin, not the viewport floor", () => {
    expect(ownSendInvertPx(16, 308, "first")).toBe(292);
    expect(ownSendInvertPx(16, 536, "first")).toBe(520);
    expect(ownSendInvertPx(400, 308, "first")).toBe(0);
  });

  it("still lifts later sends out of the composer when the slot is already nearby", () => {
    expect(ownSendInvertPx(500, 520, "follow")).toBe(OWN_SEND_FOLLOW_MIN_INVERT);
    expect(ownSendInvertPx(400, 520, "follow")).toBe(120);
  });

  it("matches the composer dock duration on first send", () => {
    expect(ownSendDurationMs("first")).toBe(COMPOSER_DOCK_MS);
    expect(ownSendDurationMs("follow")).toBe(OWN_SEND_FOLLOW_MS);
  });
});
