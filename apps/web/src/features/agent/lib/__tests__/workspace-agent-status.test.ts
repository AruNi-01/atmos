// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, it } from "bun:test";
import { AGENT_STATE } from "@/features/agent/store/agent-hooks-store";
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
        agentState: AGENT_STATE.RUNNING,
        attentionReason: "task_complete",
        attentionFilterMode: true,
      }),
    ).toEqual({ kind: "attention", reason: "task_complete" });
  });

  it("shows live permission over sticky complete", () => {
    expect(
      resolveWorkspaceAgentStatusView({
        agentState: AGENT_STATE.PERMISSION_REQUEST,
        attentionReason: "task_complete",
        attentionFilterMode: false,
      }),
    ).toEqual({ kind: "permission", state: AGENT_STATE.PERMISSION_REQUEST });
  });

  it("shows live running when not idle", () => {
    expect(
      resolveWorkspaceAgentStatusView({
        agentState: AGENT_STATE.RUNNING,
        attentionReason: null,
        attentionFilterMode: false,
      }),
    ).toEqual({ kind: "running", state: AGENT_STATE.RUNNING });
  });

  it("falls back to sticky attention when live is idle", () => {
    expect(
      resolveWorkspaceAgentStatusView({
        agentState: AGENT_STATE.IDLE,
        attentionReason: "permission_request",
        attentionFilterMode: false,
      }),
    ).toEqual({ kind: "attention", reason: "permission_request" });
  });

  it("returns none when idle and no attention", () => {
    expect(
      resolveWorkspaceAgentStatusView({
        agentState: AGENT_STATE.IDLE,
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
        agentState: AGENT_STATE.PERMISSION_REQUEST,
        attentionReason: null,
      }),
    ).toBe("permission");
    expect(
      resolveWorkspaceAgentGroupKey({
        agentState: AGENT_STATE.IDLE,
        attentionReason: "permission_request",
      }),
    ).toBe("permission");
    expect(
      resolveWorkspaceAgentGroupKey({
        agentState: AGENT_STATE.RUNNING,
        attentionReason: "permission_request",
      }),
    ).toBe("permission");
  });

  it("keeps a running agent in running even with a leftover complete latch", () => {
    expect(
      resolveWorkspaceAgentGroupKey({
        agentState: AGENT_STATE.RUNNING,
        attentionReason: "task_complete",
      }),
    ).toBe("running");
  });

  it("maps idle plus task_complete to attention", () => {
    expect(
      resolveWorkspaceAgentGroupKey({
        agentState: AGENT_STATE.IDLE,
        attentionReason: "task_complete",
      }),
    ).toBe("attention");
  });

  it("maps idle with no latch to done", () => {
    expect(
      resolveWorkspaceAgentGroupKey({
        agentState: AGENT_STATE.IDLE,
        attentionReason: null,
      }),
    ).toBe("done");
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
