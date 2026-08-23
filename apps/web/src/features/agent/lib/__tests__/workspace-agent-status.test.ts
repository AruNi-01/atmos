// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, it } from "bun:test";
import {
  parseWorkspaceAgentGroupKey,
  resolveHydratedWorkspaceAgentGroupKey,
  resolveRolledAttentionReason,
  resolveWorkspaceAgentGroupKey,
  resolveWorkspaceAgentStatusView,
  WORKSPACE_AGENT_GROUP_ORDER,
} from "../workspace-agent-status";

describe("resolveWorkspaceAgentStatusView", () => {
  it("prefers sticky attention when filter mode is on", () => {
    expect(
      resolveWorkspaceAgentStatusView({
        agentState: "running",
        attentionReason: "task_complete",
        attentionFilterMode: true,
      }),
    ).toEqual({ kind: "attention", reason: "task_complete" });
  });

  it("shows live permission over sticky complete", () => {
    expect(
      resolveWorkspaceAgentStatusView({
        agentState: "permission_request",
        attentionReason: "task_complete",
        attentionFilterMode: false,
      }),
    ).toEqual({ kind: "permission", state: "permission_request" });
  });

  it("shows live running when not idle", () => {
    expect(
      resolveWorkspaceAgentStatusView({
        agentState: "running",
        attentionReason: null,
        attentionFilterMode: false,
      }),
    ).toEqual({ kind: "running", state: "running" });
  });

  it("falls back to sticky attention when live is idle", () => {
    expect(
      resolveWorkspaceAgentStatusView({
        agentState: "idle",
        attentionReason: "permission_request",
        attentionFilterMode: false,
      }),
    ).toEqual({ kind: "attention", reason: "permission_request" });
  });

  it("returns none when idle and no attention", () => {
    expect(
      resolveWorkspaceAgentStatusView({
        agentState: "idle",
        attentionReason: null,
        attentionFilterMode: false,
      }),
    ).toEqual({ kind: "none" });
  });
});

describe("resolveRolledAttentionReason", () => {
  it("prefers permission_request over task_complete", () => {
    expect(
      resolveRolledAttentionReason(["task_complete", null, "permission_request"]),
    ).toBe("permission_request");
  });

  it("returns null when empty", () => {
    expect(resolveRolledAttentionReason([null, undefined])).toBeNull();
  });
});

describe("resolveWorkspaceAgentGroupKey", () => {
  it("maps live or sticky permission to permission", () => {
    expect(
      resolveWorkspaceAgentGroupKey({
        agentState: "permission_request",
        attentionReason: null,
      }),
    ).toBe("permission");
    expect(
      resolveWorkspaceAgentGroupKey({
        agentState: "idle",
        attentionReason: "permission_request",
      }),
    ).toBe("permission");
    expect(
      resolveWorkspaceAgentGroupKey({
        agentState: "running",
        attentionReason: "permission_request",
      }),
    ).toBe("permission");
  });

  it("keeps a running agent in running even with a leftover complete latch", () => {
    expect(
      resolveWorkspaceAgentGroupKey({
        agentState: "running",
        attentionReason: "task_complete",
      }),
    ).toBe("running");
  });

  it("maps idle plus task_complete to attention", () => {
    expect(
      resolveWorkspaceAgentGroupKey({
        agentState: "idle",
        attentionReason: "task_complete",
      }),
    ).toBe("attention");
  });

  it("maps idle with no latch to done", () => {
    expect(
      resolveWorkspaceAgentGroupKey({
        agentState: "idle",
        attentionReason: null,
      }),
    ).toBe("done");
  });

  it("keeps an acknowledged just-finished workspace in attention while grouping hold is active", () => {
    expect(
      resolveWorkspaceAgentGroupKey({
        agentState: "idle",
        attentionReason: null,
        groupingHoldActive: true,
      }),
    ).toBe("attention");
  });

  it("lets live running and permission beat grouping hold", () => {
    expect(
      resolveWorkspaceAgentGroupKey({
        agentState: "running",
        attentionReason: null,
        groupingHoldActive: true,
      }),
    ).toBe("running");
    expect(
      resolveWorkspaceAgentGroupKey({
        agentState: "idle",
        attentionReason: "permission_request",
        groupingHoldActive: true,
      }),
    ).toBe("permission");
  });

  it("uses action-first bucket order", () => {
    expect(WORKSPACE_AGENT_GROUP_ORDER).toEqual([
      "permission",
      "attention",
      "running",
      "done",
    ]);
  });
});

describe("parseWorkspaceAgentGroupKey", () => {
  it("maps the legacy idle alias and unknown values to done", () => {
    expect(parseWorkspaceAgentGroupKey("idle")).toBe("done");
    expect(parseWorkspaceAgentGroupKey("done")).toBe("done");
    expect(parseWorkspaceAgentGroupKey("running")).toBe("running");
    expect(parseWorkspaceAgentGroupKey(undefined)).toBe("done");
  });
});

describe("resolveHydratedWorkspaceAgentGroupKey", () => {
  it("uses the API snapshot until hydrate finishes when live is done", () => {
    expect(
      resolveHydratedWorkspaceAgentGroupKey({
        live: "done",
        server: "attention",
        hooksHydrated: false,
      }),
    ).toBe("attention");
  });

  it("lets live non-idle win over the snapshot", () => {
    expect(
      resolveHydratedWorkspaceAgentGroupKey({
        live: "running",
        server: "attention",
        hooksHydrated: false,
      }),
    ).toBe("running");
  });

  it("ignores the snapshot after hydrate", () => {
    expect(
      resolveHydratedWorkspaceAgentGroupKey({
        live: "done",
        server: "permission",
        hooksHydrated: true,
      }),
    ).toBe("done");
  });
});
