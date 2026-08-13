import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { dismissAttentionSummaryChrome, useAgentAttentionSummaryStore } from "./agent-attention-summary-store";
import { useAgentAttentionStore } from "./agent-attention-store";

const originalFetch = globalThis.fetch;

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
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ cleared: ["ws-1:main"] }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    })) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("dismissAttentionSummaryChrome", () => {
  test("clears local summary and latch", () => {
    useAgentAttentionStore.getState().raise({
      stablePaneId: "ws-1:main",
      contextId: "ws-1",
      reason: "task_complete",
    });
    useAgentAttentionSummaryStore.getState().upsert({
      stablePaneId: "ws-1:main",
      contextId: "ws-1",
      sessionId: "ws-1:main",
      status: "ready",
      summary: "While you were away",
      nextSteps: [],
      startedAt: Date.now(),
    });

    dismissAttentionSummaryChrome("ws-1:main");

    expect(useAgentAttentionStore.getState().hasPaneAttention("ws-1:main")).toBe(false);
    expect(useAgentAttentionSummaryStore.getState().getPane("ws-1:main")).toBeNull();
  });

  test("no-ops when neither latch nor summary exists", () => {
    const attentionRev = useAgentAttentionStore.getState().revision;
    const summaryRev = useAgentAttentionSummaryStore.getState().revision;
    dismissAttentionSummaryChrome("ws-1:main");
    expect(useAgentAttentionStore.getState().revision).toBe(attentionRev);
    expect(useAgentAttentionSummaryStore.getState().revision).toBe(summaryRev);
  });

  test("clears attention keyed by session alias", () => {
    useAgentAttentionStore.getState().raise({
      stablePaneId: "agent-session-uuid",
      contextId: "ws-1",
      reason: "task_complete",
      sessionId: "ws-1:main",
    });
    useAgentAttentionSummaryStore.getState().upsert({
      stablePaneId: "ws-1:main",
      contextId: "ws-1",
      sessionId: "agent-session-uuid",
      status: "ready",
      summary: "While you were away",
      nextSteps: [],
      startedAt: Date.now(),
    });

    dismissAttentionSummaryChrome("ws-1:main");

    expect(useAgentAttentionStore.getState().hasPaneAttention("agent-session-uuid")).toBe(false);
    expect(useAgentAttentionSummaryStore.getState().getPane("ws-1:main")).toBeNull();
  });

  test("restores this pane when dismiss fails even if another pane advanced the store", async () => {
    let rejectFetch!: (error: Error) => void;
    let fetchStarted!: () => void;
    const fetchReady = new Promise<void>((resolve) => {
      fetchStarted = resolve;
    });
    globalThis.fetch = (() => {
      fetchStarted();
      return new Promise((_, reject) => {
        rejectFetch = reject as (error: Error) => void;
      });
    }) as typeof fetch;

    useAgentAttentionStore.getState().raise({
      stablePaneId: "ws-1:main",
      contextId: "ws-1",
      reason: "task_complete",
    });
    useAgentAttentionSummaryStore.getState().upsert({
      stablePaneId: "ws-1:main",
      contextId: "ws-1",
      sessionId: "ws-1:main",
      status: "ready",
      summary: "Keep me if the request fails",
      nextSteps: [],
      startedAt: Date.now(),
    });

    dismissAttentionSummaryChrome("ws-1:main");
    expect(useAgentAttentionSummaryStore.getState().getPane("ws-1:main")).toBeNull();

    useAgentAttentionStore.getState().raise({
      stablePaneId: "ws-2:other",
      contextId: "ws-2",
      reason: "task_complete",
    });
    useAgentAttentionSummaryStore.getState().upsert({
      stablePaneId: "ws-2:other",
      contextId: "ws-2",
      sessionId: "ws-2:other",
      status: "ready",
      summary: "unrelated pane",
      nextSteps: [],
      startedAt: Date.now(),
    });

    await fetchReady;
    rejectFetch(new Error("network"));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(
      useAgentAttentionSummaryStore.getState().getPane("ws-1:main")?.summary,
    ).toBe("Keep me if the request fails");
    expect(useAgentAttentionStore.getState().hasPaneAttention("ws-1:main")).toBe(true);
    expect(
      useAgentAttentionSummaryStore.getState().getPane("ws-2:other")?.summary,
    ).toBe("unrelated pane");
  });
});
