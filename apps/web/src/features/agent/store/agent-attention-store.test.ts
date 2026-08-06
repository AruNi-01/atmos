import { beforeEach, describe, expect, mock, test } from "bun:test";
import {
  filterProjectsByAttention,
  setAgentPaneAcknowledgedHandler,
  useAgentAttentionStore,
} from "./agent-attention-store";

beforeEach(() => {
  useAgentAttentionStore.setState({
    panes: new Map(),
    filterMode: false,
    focusedStablePaneId: null,
    revision: 0,
  });
  setAgentPaneAcknowledgedHandler(null);
});

describe("agent-attention-store", () => {
  test("raise sets pane and context attention", () => {
    const store = useAgentAttentionStore.getState();
    store.raise({
      stablePaneId: "ws-1:main",
      contextId: "ws-1",
      reason: "task_complete",
    });
    expect(store.hasPaneAttention("ws-1:main")).toBe(true);
    expect(store.hasContextAttention("ws-1")).toBe(true);
    expect(store.getAttentionCount()).toBe(1);
  });

  test("permission_request wins over task_complete", () => {
    const store = useAgentAttentionStore.getState();
    store.raise({
      stablePaneId: "ws-1:main",
      contextId: "ws-1",
      reason: "task_complete",
    });
    store.raise({
      stablePaneId: "ws-1:main",
      contextId: "ws-1",
      reason: "permission_request",
    });
    expect(store.getPaneReason("ws-1:main")).toBe("permission_request");
  });

  test("notifyPaneFocused clears attention immediately", () => {
    const store = useAgentAttentionStore.getState();
    store.raise({
      stablePaneId: "ws-1:main",
      contextId: "ws-1",
      reason: "permission_request",
    });
    store.notifyPaneFocused("ws-1:main");
    expect(store.hasPaneAttention("ws-1:main")).toBe(false);
  });

  test("notifyPaneFocused acknowledges the pane so idle agent status can drop", () => {
    const ack = mock(() => {});
    setAgentPaneAcknowledgedHandler(ack);
    useAgentAttentionStore.getState().notifyPaneFocused("ws-1:main");
    expect(ack).toHaveBeenCalledTimes(1);
    expect(ack).toHaveBeenCalledWith("ws-1:main");
  });

  test("notifyPaneFocused clears attention when focus key matches sessionId alias", () => {
    const store = useAgentAttentionStore.getState();
    // Raised under agent session key; sessionId records the stable pane identity.
    store.raise({
      stablePaneId: "agent-session-uuid",
      contextId: "ws-1",
      reason: "permission_request",
      sessionId: "ws-1:main",
    });
    expect(store.hasPaneAttention("agent-session-uuid")).toBe(true);
    // Terminal focus uses the reconstructed workspace:window key.
    store.notifyPaneFocused("ws-1:main");
    expect(store.hasPaneAttention("agent-session-uuid")).toBe(false);
  });

  test("raise under stable pane id clears on matching focus", () => {
    const store = useAgentAttentionStore.getState();
    store.raise({
      stablePaneId: "ws-1:main",
      contextId: "ws-1",
      reason: "task_complete",
      sessionId: "agent-session-uuid",
    });
    store.notifyPaneFocused("ws-1:main");
    expect(store.hasPaneAttention("ws-1:main")).toBe(false);
  });

  test("filter mode turns off when last attention clears", () => {
    useAgentAttentionStore.getState().raise({
      stablePaneId: "ws-1:main",
      contextId: "ws-1",
      reason: "task_complete",
    });
    useAgentAttentionStore.getState().setFilterMode(true);
    expect(useAgentAttentionStore.getState().filterMode).toBe(true);
    useAgentAttentionStore.getState().clearPane("ws-1:main");
    expect(useAgentAttentionStore.getState().filterMode).toBe(false);
  });

  test("hydrateFromServer restores latches from API memory", () => {
    useAgentAttentionStore.getState().raise({
      stablePaneId: "stale:main",
      contextId: "stale",
      reason: "task_complete",
    });
    useAgentAttentionStore.getState().hydrateFromServer([
      {
        stable_pane_id: "ws-1:main",
        context_id: "ws-1",
        reason: "permission_request",
        session_id: "agent-uuid",
        tool: "claude-code",
        raised_at: "2026-01-01T00:00:00.000Z",
      },
    ]);
    const state = useAgentAttentionStore.getState();
    expect(state.hasPaneAttention("stale:main")).toBe(false);
    expect(state.getPaneReason("ws-1:main")).toBe("permission_request");
    expect(state.getAttentionCount()).toBe(1);
  });

  test("clearMatchingSessionIds clears by map key or stored sessionId", () => {
    const store = useAgentAttentionStore.getState();
    store.raise({
      stablePaneId: "ws-1:main",
      contextId: "ws-1",
      reason: "task_complete",
      sessionId: "agent-session-uuid",
    });
    store.raise({
      stablePaneId: "agent-session-other",
      contextId: "ws-2",
      reason: "permission_request",
      sessionId: "ws-2:main",
    });
    store.clearMatchingSessionIds(["agent-session-uuid", "agent-session-other"]);
    expect(store.hasPaneAttention("ws-1:main")).toBe(false);
    expect(store.hasPaneAttention("agent-session-other")).toBe(false);
  });

  test("tab aggregation: any pane keeps attention", () => {
    const store = useAgentAttentionStore.getState();
    store.raise({
      stablePaneId: "ws-1:a",
      contextId: "ws-1",
      reason: "task_complete",
    });
    store.raise({
      stablePaneId: "ws-1:b",
      contextId: "ws-1",
      reason: "permission_request",
    });
    expect(store.hasAnyPaneAttention(["ws-1:a", "ws-1:b"])).toBe(true);
    store.clearPane("ws-1:a");
    expect(store.hasAnyPaneAttention(["ws-1:a", "ws-1:b"])).toBe(true);
    store.clearPane("ws-1:b");
    expect(store.hasAnyPaneAttention(["ws-1:a", "ws-1:b"])).toBe(false);
    expect(store.hasContextAttention("ws-1")).toBe(false);
  });
});

describe("filterProjectsByAttention", () => {
  test("keeps only workspaces that need attention under a parent project", () => {
    const projects = [
      {
        id: "p1",
        workspaces: [
          { id: "w1" },
          { id: "w2" },
        ],
      },
      {
        id: "p2",
        workspaces: [{ id: "w3" }],
      },
    ];
    const filtered = filterProjectsByAttention(projects, ["w1"]);
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.id).toBe("p1");
    expect(filtered[0]?.workspaces.map((w) => w.id)).toEqual(["w1"]);
  });

  test("hides all workspaces when the project itself needs attention", () => {
    const projects = [
      {
        id: "p1",
        workspaces: [{ id: "w1" }, { id: "w2" }],
      },
    ];
    const filtered = filterProjectsByAttention(projects, ["p1", "w1"]);
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.id).toBe("p1");
    // Project-level latch wins: children stay hidden so the project row is the target.
    expect(filtered[0]?.workspaces).toEqual([]);
  });

  test("drops projects with no attention on self or children", () => {
    const projects = [
      { id: "p1", workspaces: [{ id: "w1" }] },
      { id: "p2", workspaces: [{ id: "w2" }] },
    ];
    const filtered = filterProjectsByAttention(projects, ["w2"]);
    expect(filtered.map((p) => p.id)).toEqual(["p2"]);
  });
});
