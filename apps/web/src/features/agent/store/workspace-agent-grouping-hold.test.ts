import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  useWorkspaceAgentGroupingHoldStore,
  WORKSPACE_AGENT_GROUPING_HOLD_MS,
} from "./workspace-agent-grouping-hold";

beforeEach(() => {
  useWorkspaceAgentGroupingHoldStore.getState().clearAll();
});

afterEach(() => {
  useWorkspaceAgentGroupingHoldStore.getState().clearAll();
});

describe("workspace agent grouping hold", () => {
  test("beginHold keeps the context active until expireDue", () => {
    const store = useWorkspaceAgentGroupingHoldStore.getState();
    store.beginHold("ws-1");
    expect(store.isHoldActive("ws-1")).toBe(true);
    expect(store.isHoldActive("ws-2")).toBe(false);

    store.expireDue(Date.now() + WORKSPACE_AGENT_GROUPING_HOLD_MS + 1);
    expect(useWorkspaceAgentGroupingHoldStore.getState().isHoldActive("ws-1")).toBe(
      false,
    );
  });

  test("beginHold ignores blank context ids", () => {
    useWorkspaceAgentGroupingHoldStore.getState().beginHold("  ");
    expect(
      useWorkspaceAgentGroupingHoldStore.getState().untilByContextId.size,
    ).toBe(0);
  });

  test("clearHold drops one context without touching others", () => {
    const store = useWorkspaceAgentGroupingHoldStore.getState();
    store.beginHold("ws-1");
    store.beginHold("ws-2");
    store.clearHold("ws-1");
    expect(store.isHoldActive("ws-1")).toBe(false);
    expect(store.isHoldActive("ws-2")).toBe(true);
  });

  test("clearAll drops every hold", () => {
    const store = useWorkspaceAgentGroupingHoldStore.getState();
    store.beginHold("ws-1");
    store.beginHold("ws-2");
    store.clearAll();
    expect(store.isHoldActive("ws-1")).toBe(false);
    expect(store.isHoldActive("ws-2")).toBe(false);
    expect(
      useWorkspaceAgentGroupingHoldStore.getState().untilByContextId.size,
    ).toBe(0);
  });
});
