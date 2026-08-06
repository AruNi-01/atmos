import {
  AGENT_STATE,
  type AgentHookState,
} from "@/features/agent/store/agent-hooks-store";
import type { AttentionReason } from "@/features/agent/store/agent-attention-store";

/**
 * What a workspace/project list row should show for agent status.
 * Shared by sidebar, kanban, and global search.
 */
export type WorkspaceAgentStatusView =
  | { kind: "none" }
  | { kind: "running"; state: typeof AGENT_STATE.RUNNING }
  | { kind: "permission"; state: typeof AGENT_STATE.PERMISSION_REQUEST }
  | { kind: "attention"; reason: AttentionReason };

/**
 * Single priority for list-surface agent marks (sidebar / kanban / search):
 *
 * 1. Attention filter mode + sticky reason → attention bell
 * 2. Live hook state (permission / running) → live indicator
 * 3. Sticky attention (task complete / permission latch) → attention bell
 * 4. Otherwise → nothing
 */
export function resolveWorkspaceAgentStatusView(input: {
  agentState: AgentHookState;
  attentionReason: AttentionReason | null;
  attentionFilterMode: boolean;
}): WorkspaceAgentStatusView {
  const { agentState, attentionReason, attentionFilterMode } = input;

  if (attentionFilterMode && attentionReason) {
    return { kind: "attention", reason: attentionReason };
  }

  if (agentState === AGENT_STATE.PERMISSION_REQUEST) {
    return { kind: "permission", state: AGENT_STATE.PERMISSION_REQUEST };
  }

  if (agentState === AGENT_STATE.RUNNING) {
    return { kind: "running", state: AGENT_STATE.RUNNING };
  }

  if (attentionReason) {
    return { kind: "attention", reason: attentionReason };
  }

  return { kind: "none" };
}

/**
 * Highest-priority attention among a project and its workspaces
 * (permission beats task_complete). Used when a project row is collapsed.
 */
export function resolveRolledAttentionReason(
  reasons: ReadonlyArray<AttentionReason | null | undefined>,
): AttentionReason | null {
  let best: AttentionReason | null = null;
  for (const reason of reasons) {
    if (!reason) continue;
    if (!best || (reason === "permission_request" && best !== "permission_request")) {
      best = reason;
    }
  }
  return best;
}
