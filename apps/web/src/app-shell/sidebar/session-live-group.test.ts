import { describe, expect, test } from "bun:test";
import type { PaneAttention } from "@/features/agent/store/agent-attention-store";
import type { AgentStatusRecord } from "@/features/agent/store/agent-status-store";
import {
  sessionAgentStatusView,
  sessionLiveGroupKey,
  sessionMatchesAttentionFilter,
} from "@/app-shell/sidebar/session-live-group";

function live(state: AgentStatusRecord["state"]): AgentStatusRecord {
  return {
    session_id: "ws:1",
    tool: "claude-code",
    state,
    timestamp: "2026-01-01T00:00:00.000Z",
    pane_id: "ws:1",
  };
}

function latch(reason: PaneAttention["reason"]): PaneAttention {
  return {
    stablePaneId: "ws:1",
    contextId: "ws",
    reason,
    sessionId: "ws:1",
    raisedAt: 1,
  };
}

describe("session live group", () => {
  test("cleared attention drops a stale snapshot back to done", () => {
    expect(
      sessionLiveGroupKey("ws:1", "attention", new Map(), new Map(), true),
    ).toBe("done");
    expect(
      sessionLiveGroupKey("ws:1", "permission", new Map(), new Map(), true),
    ).toBe("done");
  });

  test("keeps the snapshot until agent state has hydrated", () => {
    expect(
      sessionLiveGroupKey("ws:1", "attention", new Map(), new Map(), false),
    ).toBe("attention");
  });

  test("keeps need attention during the same post-click hold as agent status", () => {
    expect(
      sessionLiveGroupKey(
        "ws:1",
        "attention",
        new Map([["ws:1", live("idle")]]),
        new Map(),
        true,
        true,
      ),
    ).toBe("attention");
  });
  test("live idle with no latch overrides a stale attention snapshot", () => {
    expect(
      sessionLiveGroupKey(
        "ws:1",
        "attention",
        new Map([["ws:1", live("idle")]]),
        new Map(),
        true,
      ),
    ).toBe("done");
  });

  test("a remaining permission latch stays need permission", () => {
    expect(
      sessionLiveGroupKey(
        "ws:1",
        "done",
        new Map([["ws:1", live("idle")]]),
        new Map([["ws:1", latch("permission_request")]]),
        true,
      ),
    ).toBe("permission");
  });

  test("live running wins over a done snapshot", () => {
    expect(
      sessionLiveGroupKey(
        "ws:1",
        "done",
        new Map([["ws:1", live("running")]]),
        new Map(),
        true,
      ),
    ).toBe("running");
  });

  test("a chat row matches a live record stored under surface id", () => {
    const record = live("running");
    record.session_id = "provider-run";
    record.pane_id = null;
    record.surface = "chat";
    record.surface_id = "chat-1";
    expect(
      sessionAgentStatusView(
        "chat:chat-1",
        new Map([["provider-run", record]]),
        new Map(),
        false,
      ),
    ).toEqual({ kind: "running", state: "running" });
  });

  test("filter mode shows the attention bell over a still-running session", () => {
    expect(
      sessionAgentStatusView(
        "ws:1",
        new Map([["ws:1", live("running")]]),
        new Map([["ws:1", latch("task_complete")]]),
        true,
      ),
    ).toEqual({ kind: "attention", reason: "task_complete" });
  });

  test("attention filter keeps latched sessions and hides running-only ones", () => {
    const running = live("running");
    running.session_id = "ws:2";
    running.pane_id = "ws:2";
    const sessions = new Map<string, ReturnType<typeof live>>([
      ["ws:1", live("idle")],
      ["ws:2", running],
    ]);
    const panes = new Map([["ws:1", latch("task_complete")]]);
    expect(
      sessionMatchesAttentionFilter("ws:1", "attention", sessions, panes, true),
    ).toBe(true);
    expect(
      sessionMatchesAttentionFilter("ws:2", "running", sessions, panes, true),
    ).toBe(false);
    expect(
      sessionMatchesAttentionFilter(
        "ws:1",
        "done",
        new Map([["ws:1", live("idle")]]),
        new Map([["ws:1", latch("permission_request")]]),
        true,
      ),
    ).toBe(true);
  });

  test("attention filter trusts a snapshot only before hydrate", () => {
    expect(
      sessionMatchesAttentionFilter("ws:1", "permission", new Map(), new Map(), false),
    ).toBe(true);
    expect(
      sessionMatchesAttentionFilter("ws:1", "attention", new Map(), new Map(), true),
    ).toBe(false);
  });
});
