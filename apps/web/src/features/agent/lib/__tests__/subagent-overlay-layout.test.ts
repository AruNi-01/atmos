import { describe, expect, it } from "bun:test";
import {
  SUBAGENT_OVERLAY_MAX_RATIO,
  SUBAGENT_OVERLAY_TOP_GAP_PX,
  OVERLAY_CARD_MAX_HEIGHT_CLASS,
  OVERLAY_CARD_MAX_HEIGHT_VAR,
  subagentOverlayFrameHeight,
} from "@/features/agent/lib/subagent-overlay-layout";

describe("subagentOverlayFrameHeight", () => {
  it("uses 80% of the column when the composer is short", () => {
    expect(SUBAGENT_OVERLAY_MAX_RATIO).toBe(0.8);
    expect(OVERLAY_CARD_MAX_HEIGHT_VAR).toBe("--agent-overlay-card-max-height");
    expect(OVERLAY_CARD_MAX_HEIGHT_CLASS).toBe(
      "max-h-[var(--agent-overlay-card-max-height,80cqh)]",
    );
    expect(subagentOverlayFrameHeight(800, 96)).toBe(640);
  });

  it("stops a small gap below the column top when the composer is tall", () => {
    expect(SUBAGENT_OVERLAY_TOP_GAP_PX).toBe(8);
    expect(subagentOverlayFrameHeight(800, 300)).toBe(492);
  });

  it("does not go negative when the composer fills the column", () => {
    expect(subagentOverlayFrameHeight(400, 400)).toBe(0);
    expect(subagentOverlayFrameHeight(0, 80)).toBe(0);
  });
});
