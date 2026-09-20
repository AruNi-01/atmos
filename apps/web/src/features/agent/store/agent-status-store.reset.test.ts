import { beforeEach, describe, expect, test } from "bun:test";
import { useAgentAttentionStore } from "./agent-attention-store";
import {
  AGENT_STATE,
  useAgentStatusStore,
  type AgentStatusRecord,
} from "./agent-status-store";
import { useWorkspaceAgentGroupingHoldStore } from "./workspace-agent-grouping-hold";

function runningSession(contextId: string): AgentStatusRecord {
  return {
    session_id: `${contextId}:agent`,
    tool: "claude-code",
    state: AGENT_STATE.RUNNING,
    timestamp: "2026-08-13T00:00:00.000Z",
    context_id: contextId,
    pane_id: `${contextId}:agent`,
  };
}

beforeEach(() => {
  useAgentStatusStore.setState({
    sessions: new Map(),
    serverWorkspaceGroupKeys: {},
    statusHydrated: false,
  });
  useAgentAttentionStore.setState({
    panes: new Map(),
    filterMode: false,
    focusedStablePaneId: null,
    revision: 0,
  });
  useWorkspaceAgentGroupingHoldStore.getState().clearAll();
});

describe("resetForConnectionChange", () => {
  test("drops sessions and grouping snapshot so a Computer switch cannot leak buckets", () => {
    useAgentStatusStore.setState({
      sessions: new Map([["ws-1:agent", runningSession("ws-1")]]),
      serverWorkspaceGroupKeys: { "ws-1": "running" },
      statusHydrated: true,
    });
    useAgentAttentionStore.getState().raise({
      stablePaneId: "ws-1:agent",
      contextId: "ws-1",
      reason: "permission_request",
    });
    useWorkspaceAgentGroupingHoldStore.getState().beginHold("ws-1");

    useAgentStatusStore.getState().resetForConnectionChange();

    const hooks = useAgentStatusStore.getState();
    expect(hooks.sessions.size).toBe(0);
    expect(hooks.serverWorkspaceGroupKeys).toEqual({});
    expect(hooks.statusHydrated).toBe(false);
    expect(useAgentAttentionStore.getState().panes.size).toBe(0);
    expect(
      useWorkspaceAgentGroupingHoldStore.getState().isHoldActive("ws-1"),
    ).toBe(false);
  });
});
