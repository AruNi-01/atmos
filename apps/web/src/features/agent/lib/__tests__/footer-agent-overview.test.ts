import { describe, expect, it } from "bun:test";
import type { AgentHookSession } from "@/features/agent/store/agent-hooks-store";
import type { PaneAttention } from "@/features/agent/store/agent-attention-store";
import {
  buildFooterAgentOverview,
  countFooterAgentOverview,
  footerAgentOverviewTotal,
} from "../footer-agent-overview";

function session(
  overrides: Partial<AgentHookSession> & Pick<AgentHookSession, "session_id" | "state">,
): AgentHookSession {
  return {
    tool: "claude-code",
    timestamp: "2026-08-26T00:00:00.000Z",
    context_id: "ws-1",
    pane_id: overrides.session_id,
    ...overrides,
  };
}

function latch(
  overrides: Partial<PaneAttention> & Pick<PaneAttention, "stablePaneId" | "reason">,
): PaneAttention {
  return {
    contextId: "ws-1",
    sessionId: overrides.stablePaneId,
    raisedAt: Date.parse("2026-08-26T00:00:00.000Z"),
    ...overrides,
  };
}

describe("buildFooterAgentOverview", () => {
  it("counts running, idle, need attention, and need permission without double counting", () => {
    const overview = buildFooterAgentOverview(
      [
        session({ session_id: "ws-1:run", state: "running" }),
        session({ session_id: "ws-1:idle", state: "idle" }),
        session({ session_id: "ws-1:perm", state: "permission_request" }),
        session({ session_id: "ws-1:done", state: "idle" }),
      ],
      [
        latch({ stablePaneId: "ws-1:done", reason: "task_complete" }),
        latch({ stablePaneId: "ws-1:perm", reason: "permission_request" }),
        latch({ stablePaneId: "ws-1:orphan", reason: "task_complete" }),
      ],
    );

    expect(overview.counts).toEqual({
      running: 1,
      idle: 1,
      attention: 2,
      permission: 1,
    });
    expect(footerAgentOverviewTotal(overview.counts)).toBe(5);
    expect(overview.rows.filter((row) => row.bucket === "attention").map((row) => row.session.session_id)).toEqual([
      "ws-1:done",
      "ws-1:orphan",
    ]);
  });

  it("keeps a live running session in running even if a complete latch is still present", () => {
    expect(
      countFooterAgentOverview(
        [session({ session_id: "ws-1:run", state: "running" })],
        [latch({ stablePaneId: "ws-1:run", reason: "task_complete" })],
      ),
    ).toEqual({
      running: 1,
      idle: 0,
      attention: 0,
      permission: 0,
    });
  });
});
