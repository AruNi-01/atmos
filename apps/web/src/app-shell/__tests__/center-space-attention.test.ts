import { describe, expect, it } from "bun:test";
import {
  hostSpaceAttentionReasons,
  offActiveSpaceAttentionReason,
  spaceIdFromStablePaneId,
} from "@/app-shell/center-space/center-space-attention";
import { DEFAULT_CENTER_SPACE_ID } from "@/app-shell/center-space/center-space";
import type { PaneAttention } from "@/features/agent/store/agent-attention-store";

function latch(
  overrides: Partial<PaneAttention> & Pick<PaneAttention, "stablePaneId" | "contextId" | "reason">,
): PaneAttention {
  return {
    sessionId: overrides.stablePaneId,
    raisedAt: 1,
    ...overrides,
  };
}

describe("center space attention", () => {
  it("reads extra-space ids from namespaced tmux windows", () => {
    expect(spaceIdFromStablePaneId("ws-1:1")).toBe(DEFAULT_CENTER_SPACE_ID);
    expect(spaceIdFromStablePaneId("ws-1:cs__space-abc__1")).toBe("space-abc");
    expect(spaceIdFromStablePaneId("ws-1:cs__space-abc__Claude Code")).toBe("space-abc");
  });

  it("groups host attention by space and prefers permission", () => {
    const reasons = hostSpaceAttentionReasons(
      [
        latch({
          stablePaneId: "ws-1:1",
          contextId: "ws-1",
          reason: "task_complete",
        }),
        latch({
          stablePaneId: "ws-1:cs__space-abc__2",
          contextId: "ws-1",
          reason: "task_complete",
        }),
        latch({
          stablePaneId: "ws-1:cs__space-abc__3",
          contextId: "ws-1",
          reason: "permission_request",
        }),
        latch({
          stablePaneId: "ws-2:cs__space-abc__1",
          contextId: "ws-2",
          reason: "permission_request",
        }),
      ],
      "ws-1",
    );
    expect(reasons[DEFAULT_CENTER_SPACE_ID]).toBe("task_complete");
    expect(reasons["space-abc"]).toBe("permission_request");
    expect(reasons["space-other"]).toBeUndefined();
  });

  it("only reports off-active-space attention for the header badge", () => {
    const reasons = {
      [DEFAULT_CENTER_SPACE_ID]: "task_complete" as const,
      "space-abc": "permission_request" as const,
    };
    expect(offActiveSpaceAttentionReason(reasons, DEFAULT_CENTER_SPACE_ID)).toBe(
      "permission_request",
    );
    expect(offActiveSpaceAttentionReason(reasons, "space-abc")).toBe("task_complete");
    expect(
      offActiveSpaceAttentionReason(
        { [DEFAULT_CENTER_SPACE_ID]: "task_complete" },
        DEFAULT_CENTER_SPACE_ID,
      ),
    ).toBeNull();
  });
});
