import { afterEach, beforeEach, describe, expect, jest, mock, test } from "bun:test";
import {
  ATTENTION_AUTO_CLEAR_MS,
  clearAgentAttentionAutoClearTimers,
  filterProjectsByAttention,
  setAgentPaneAcknowledgedHandler,
  useAgentAttentionStore,
} from "./agent-attention-store";
import { useAgentAttentionSummaryStore } from "./agent-attention-summary-store";
import {
  useWorkspaceAgentGroupingHoldStore,
  WORKSPACE_AGENT_GROUPING_HOLD_MS,
} from "./workspace-agent-grouping-hold";

beforeEach(() => {
  useAgentAttentionStore.setState({
    panes: new Map(),
    filterMode: false,
    focusedStablePaneId: null,
    revision: 0,
  });
  useAgentAttentionSummaryStore.setState({
    panes: new Map(),
    revision: 0,
  });
  useWorkspaceAgentGroupingHoldStore.getState().clearAll();
  setAgentPaneAcknowledgedHandler(null);
  clearAgentAttentionAutoClearTimers();
});

afterEach(() => {
  jest.useRealTimers();
  clearAgentAttentionAutoClearTimers();
  useWorkspaceAgentGroupingHoldStore.getState().clearAll();
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

  test("notifyPaneFocused clears task_complete immediately", () => {
    const store = useAgentAttentionStore.getState();
    store.raise({
      stablePaneId: "ws-1:main",
      contextId: "ws-1",
      reason: "task_complete",
    });
    store.notifyPaneFocused("ws-1:main");
    expect(store.hasPaneAttention("ws-1:main")).toBe(false);
  });

  test("notifyPaneFocused keeps pending permission_request latched", () => {
    const store = useAgentAttentionStore.getState();
    store.raise({
      stablePaneId: "ws-1:main",
      contextId: "ws-1",
      reason: "permission_request",
    });
    store.notifyPaneFocused("ws-1:main");
    expect(store.hasPaneAttention("ws-1:main")).toBe(true);
    expect(store.getPaneReason("ws-1:main")).toBe("permission_request");
    expect(store.getAttentionCount()).toBe(1);
  });

  test("deferred auto-focus keeps attention until the dwell window", () => {
    jest.useFakeTimers();
    const store = useAgentAttentionStore.getState();
    store.raise({
      stablePaneId: "ws-1:main",
      contextId: "ws-1",
      reason: "task_complete",
    });
    store.notifyPaneFocused("ws-1:main", { ack: "deferred" });
    expect(store.hasPaneAttention("ws-1:main")).toBe(true);
    jest.advanceTimersByTime(ATTENTION_AUTO_CLEAR_MS - 1);
    expect(store.hasPaneAttention("ws-1:main")).toBe(true);
    jest.advanceTimersByTime(1);
    expect(useAgentAttentionStore.getState().hasPaneAttention("ws-1:main")).toBe(
      false,
    );
  });

  test("deferred auto-focus never clears pending permission_request", () => {
    jest.useFakeTimers();
    const store = useAgentAttentionStore.getState();
    store.raise({
      stablePaneId: "ws-1:main",
      contextId: "ws-1",
      reason: "permission_request",
    });
    store.notifyPaneFocused("ws-1:main", { ack: "deferred" });
    jest.advanceTimersByTime(ATTENTION_AUTO_CLEAR_MS + 1000);
    expect(useAgentAttentionStore.getState().hasPaneAttention("ws-1:main")).toBe(
      true,
    );
  });

  test("user click clears a deferred auto-focus ring immediately", () => {
    jest.useFakeTimers();
    const store = useAgentAttentionStore.getState();
    store.raise({
      stablePaneId: "ws-1:main",
      contextId: "ws-1",
      reason: "task_complete",
    });
    store.notifyPaneFocused("ws-1:main", { ack: "deferred" });
    expect(store.hasPaneAttention("ws-1:main")).toBe(true);
    store.notifyPaneFocused("ws-1:main");
    expect(store.hasPaneAttention("ws-1:main")).toBe(false);
  });

  test("deferred auto-focus does not clear after leaving the pane", () => {
    jest.useFakeTimers();
    const store = useAgentAttentionStore.getState();
    store.raise({
      stablePaneId: "ws-1:main",
      contextId: "ws-1",
      reason: "task_complete",
    });
    store.notifyPaneFocused("ws-1:main", { ack: "deferred" });
    store.notifyPaneFocused("ws-1:other", { ack: "deferred" });
    jest.advanceTimersByTime(ATTENTION_AUTO_CLEAR_MS);
    expect(useAgentAttentionStore.getState().hasPaneAttention("ws-1:main")).toBe(
      true,
    );
  });

  test("deferred auto-focus clears task_complete latched under a session alias", () => {
    jest.useFakeTimers();
    const store = useAgentAttentionStore.getState();
    store.raise({
      stablePaneId: "agent-session-uuid",
      contextId: "ws-1",
      reason: "task_complete",
      sessionId: "ws-1:main",
    });
    store.notifyPaneFocused("ws-1:main", { ack: "deferred" });
    expect(store.hasPaneAttention("agent-session-uuid")).toBe(true);
    jest.advanceTimersByTime(ATTENTION_AUTO_CLEAR_MS);
    expect(
      useAgentAttentionStore.getState().hasPaneAttention("agent-session-uuid"),
    ).toBe(false);
  });

  test("raise while focused auto-clears after the dwell window", () => {
    jest.useFakeTimers();
    const store = useAgentAttentionStore.getState();
    store.notifyPaneFocused("ws-1:main");
    store.raise({
      stablePaneId: "ws-1:main",
      contextId: "ws-1",
      reason: "task_complete",
    });
    expect(store.hasPaneAttention("ws-1:main")).toBe(true);
    jest.advanceTimersByTime(ATTENTION_AUTO_CLEAR_MS);
    expect(useAgentAttentionStore.getState().hasPaneAttention("ws-1:main")).toBe(
      false,
    );
  });

  test("raise permission while focused stays latched", () => {
    jest.useFakeTimers();
    const store = useAgentAttentionStore.getState();
    store.notifyPaneFocused("ws-1:main");
    store.raise({
      stablePaneId: "ws-1:main",
      contextId: "ws-1",
      reason: "permission_request",
    });
    jest.advanceTimersByTime(ATTENTION_AUTO_CLEAR_MS + 1000);
    expect(useAgentAttentionStore.getState().hasPaneAttention("ws-1:main")).toBe(
      true,
    );
    expect(useAgentAttentionStore.getState().getAttentionCount()).toBe(1);
  });

  test("repeated deferred auto-focus does not restart the dwell window", () => {
    jest.useFakeTimers();
    const store = useAgentAttentionStore.getState();
    store.raise({
      stablePaneId: "ws-1:main",
      contextId: "ws-1",
      reason: "task_complete",
    });
    store.notifyPaneFocused("ws-1:main", { ack: "deferred" });
    jest.advanceTimersByTime(1000);
    store.notifyPaneFocused("ws-1:main", { ack: "deferred" });
    jest.advanceTimersByTime(ATTENTION_AUTO_CLEAR_MS - 1000);
    expect(useAgentAttentionStore.getState().hasPaneAttention("ws-1:main")).toBe(
      false,
    );
  });

  test("deferred auto-focus does not drop idle status until the dwell window", () => {
    jest.useFakeTimers();
    const ack = mock(() => {});
    setAgentPaneAcknowledgedHandler(ack);
    const store = useAgentAttentionStore.getState();
    store.raise({
      stablePaneId: "ws-1:main",
      contextId: "ws-1",
      reason: "task_complete",
    });
    store.notifyPaneFocused("ws-1:main", { ack: "deferred" });
    expect(ack).toHaveBeenCalledTimes(0);
    jest.advanceTimersByTime(ATTENTION_AUTO_CLEAR_MS);
    expect(ack).toHaveBeenCalledTimes(1);
    expect(ack).toHaveBeenCalledWith("ws-1:main");
  });

  test("clearing the last task_complete latch starts a grouping hold", () => {
    const store = useAgentAttentionStore.getState();
    store.raise({
      stablePaneId: "ws-1:main",
      contextId: "ws-1",
      reason: "task_complete",
    });
    store.notifyPaneFocused("ws-1:main");
    expect(store.hasPaneAttention("ws-1:main")).toBe(false);
    expect(
      useWorkspaceAgentGroupingHoldStore.getState().isHoldActive("ws-1"),
    ).toBe(true);
  });

  test("clearing permission does not start a grouping hold", () => {
    const store = useAgentAttentionStore.getState();
    store.raise({
      stablePaneId: "ws-1:main",
      contextId: "ws-1",
      reason: "permission_request",
    });
    // Focus alone must not clear permission; explicit clear simulates resolve.
    store.clearPane("ws-1:main");
    expect(store.hasPaneAttention("ws-1:main")).toBe(false);
    expect(
      useWorkspaceAgentGroupingHoldStore.getState().isHoldActive("ws-1"),
    ).toBe(false);
  });

  test("grouping hold waits until the last task_complete latch on the context is gone", () => {
    const store = useAgentAttentionStore.getState();
    store.raise({
      stablePaneId: "ws-1:a",
      contextId: "ws-1",
      reason: "task_complete",
    });
    store.raise({
      stablePaneId: "ws-1:b",
      contextId: "ws-1",
      reason: "task_complete",
    });
    store.notifyPaneFocused("ws-1:a");
    expect(
      useWorkspaceAgentGroupingHoldStore.getState().isHoldActive("ws-1"),
    ).toBe(false);
    expect(store.hasContextAttention("ws-1")).toBe(true);
    store.notifyPaneFocused("ws-1:b");
    expect(
      useWorkspaceAgentGroupingHoldStore.getState().isHoldActive("ws-1"),
    ).toBe(true);
  });

  test("unacknowledged task_complete does not start a grouping hold", () => {
    useAgentAttentionStore.getState().raise({
      stablePaneId: "ws-1:main",
      contextId: "ws-1",
      reason: "task_complete",
    });
    expect(
      useWorkspaceAgentGroupingHoldStore.getState().isHoldActive("ws-1"),
    ).toBe(false);
    expect(useAgentAttentionStore.getState().hasContextAttention("ws-1")).toBe(
      true,
    );
  });

  test("grouping hold survives ack and expires after the dwell window", () => {
    const attention = useAgentAttentionStore.getState();
    attention.raise({
      stablePaneId: "ws-1:main",
      contextId: "ws-1",
      reason: "task_complete",
    });
    attention.notifyPaneFocused("ws-1:main");
    expect(attention.getContextReason("ws-1")).toBeNull();
    expect(
      useWorkspaceAgentGroupingHoldStore.getState().isHoldActive("ws-1"),
    ).toBe(true);

    useWorkspaceAgentGroupingHoldStore
      .getState()
      .expireDue(Date.now() + WORKSPACE_AGENT_GROUPING_HOLD_MS + 1);
    expect(
      useWorkspaceAgentGroupingHoldStore.getState().isHoldActive("ws-1"),
    ).toBe(false);
  });

  test("notifyPaneFocused acknowledges the pane so idle agent status can drop", () => {
    const ack = mock(() => {});
    setAgentPaneAcknowledgedHandler(ack);
    useAgentAttentionStore.getState().notifyPaneFocused("ws-1:main");
    expect(ack).toHaveBeenCalledTimes(1);
    expect(ack).toHaveBeenCalledWith("ws-1:main");
  });

  test("notifyPaneFocused keeps auto-summary chrome", () => {
    useAgentAttentionSummaryStore.getState().upsert({
      stablePaneId: "ws-1:main",
      contextId: "ws-1",
      sessionId: "ws-1:main",
      status: "ready",
      summary: "Shipped the recap.",
      nextSteps: ["Open the PR"],
      startedAt: Date.now(),
    });
    const store = useAgentAttentionStore.getState();
    store.raise({
      stablePaneId: "ws-1:main",
      contextId: "ws-1",
      reason: "task_complete",
    });
    store.notifyPaneFocused("ws-1:main");
    expect(store.hasPaneAttention("ws-1:main")).toBe(false);
    expect(
      useAgentAttentionSummaryStore.getState().getPane("ws-1:main")?.summary,
    ).toBe("Shipped the recap.");
  });

  test("notifyPaneFocused clears task_complete when focus key matches sessionId alias", () => {
    const store = useAgentAttentionStore.getState();
    // Raised under agent session key; sessionId records the stable pane identity.
    store.raise({
      stablePaneId: "agent-session-uuid",
      contextId: "ws-1",
      reason: "task_complete",
      sessionId: "ws-1:main",
    });
    expect(store.hasPaneAttention("agent-session-uuid")).toBe(true);
    // Terminal focus uses the reconstructed workspace:window key.
    store.notifyPaneFocused("ws-1:main");
    expect(store.hasPaneAttention("agent-session-uuid")).toBe(false);
  });

  test("notifyPaneFocused keeps permission when focus key matches sessionId alias", () => {
    const store = useAgentAttentionStore.getState();
    store.raise({
      stablePaneId: "chat:abc",
      contextId: "ws-1",
      reason: "permission_request",
      sessionId: "chat:abc",
    });
    store.notifyPaneFocused("chat:abc");
    expect(store.hasPaneAttention("chat:abc")).toBe(true);
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
