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
});
