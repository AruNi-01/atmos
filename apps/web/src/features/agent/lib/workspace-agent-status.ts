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
 * Sidebar / kanban grouping buckets for live Agent activity.
 * Distinct from workflow `By Status` (`backlog` / `todo` / …).
 */
export type WorkspaceAgentGroupKey =
  | "permission"
  | "attention"
  | "running"
  | "idle";

export const WORKSPACE_AGENT_GROUP_ORDER: WorkspaceAgentGroupKey[] = [
  "permission",
  "attention",
  "running",
  "idle",
];

/**
 * Grouping bucket for one workspace. Does **not** honor attention-filter overlay:
 * a still-running agent stays in `running` even if the filter would show a bell.
 *
 * Priority: permission (live or sticky) > running > task_complete attention > idle.
 */
export function resolveWorkspaceAgentGroupKey(input: {
  agentState: AgentHookState;
  attentionReason: AttentionReason | null;
}): WorkspaceAgentGroupKey {
  const { agentState, attentionReason } = input;

  if (
    agentState === AGENT_STATE.PERMISSION_REQUEST ||
    attentionReason === "permission_request"
  ) {
    return "permission";
  }

  if (agentState === AGENT_STATE.RUNNING) {
    return "running";
  }

  if (attentionReason === "task_complete") {
    return "attention";
  }

  return "idle";
}

/**
 * Refresh hydrate: live WS/stores always win when they are not idle.
 * Until sessions+attention finish loading, fall back to the API-memory snapshot.
 */
export function resolveHydratedWorkspaceAgentGroupKey(input: {
  live: WorkspaceAgentGroupKey;
  server?: WorkspaceAgentGroupKey;
  hooksHydrated: boolean;
}): WorkspaceAgentGroupKey {
  if (input.live !== "idle") return input.live;
  if (!input.hooksHydrated && input.server && input.server !== "idle") {
    return input.server;
  }
  return input.live;
}

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
