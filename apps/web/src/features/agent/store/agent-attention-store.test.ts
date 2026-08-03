import { beforeEach, describe, expect, test } from "bun:test";
import {
  filterProjectsByAttention,
  useAgentAttentionStore,
} from "./agent-attention-store";

beforeEach(() => {
  useAgentAttentionStore.setState({
    panes: new Map(),
    filterMode: false,
    focusedStablePaneId: null,
    revision: 0,
  });
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
  test("keeps projects/workspaces that need attention", () => {
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
});
