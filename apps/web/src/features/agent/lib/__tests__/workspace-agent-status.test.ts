// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, it } from "bun:test";
import { AGENT_STATE } from "@/features/agent/store/agent-hooks-store";
import {
  resolveRolledAttentionReason,
  resolveWorkspaceAgentStatusView,
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
