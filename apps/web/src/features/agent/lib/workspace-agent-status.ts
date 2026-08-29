import type { AgentOccupancy } from "@/features/agent/store/agent-status-store";
import type { AttentionReason } from "@/features/agent/store/agent-attention-store";

/**
 * What a workspace/project list row should show for agent status.
 * Shared by sidebar, kanban, and global search.
 */
export type WorkspaceAgentStatusView =
  | { kind: "none" }
  | { kind: "running"; state: "running" }
  | { kind: "permission"; state: "permission_request" }
  | { kind: "attention"; reason: AttentionReason };

/**
 * Sidebar / kanban grouping buckets for live Agent activity.
 * Distinct from workflow `By Status` (`backlog` / `todo` / …).
 */
export type WorkspaceAgentGroupKey =
  | "permission"
  | "attention"
  | "running"
  | "done";

export const WORKSPACE_AGENT_GROUP_ORDER: WorkspaceAgentGroupKey[] = [
  "permission",
  "attention",
  "running",
  "done",
];

const WORKSPACE_AGENT_GROUP_KEYS = new Set<WorkspaceAgentGroupKey>(
  WORKSPACE_AGENT_GROUP_ORDER,
);

/**
 * Accepts the live key, a snapshot value, or the pre-Done wire alias `idle`.
 * Unknown / missing values fall through to `done` (the remainder bucket).
 */
export function parseWorkspaceAgentGroupKey(value: unknown): WorkspaceAgentGroupKey {
  if (value === "idle") return "done";
  if (typeof value === "string" && WORKSPACE_AGENT_GROUP_KEYS.has(value as WorkspaceAgentGroupKey)) {
    return value as WorkspaceAgentGroupKey;
  }
  return "done";
}

/**
 * Grouping bucket for one workspace. Does **not** honor attention-filter overlay:
 * a still-running agent stays in `running` even if the filter would show a bell.
 *
 * Priority: permission (live or sticky) > running > task_complete attention
 * or post-ack grouping hold > done.
 *
 * `groupingHoldActive` keeps an acknowledged just-finished workspace in
 * `attention` for a short dwell so the sidebar row does not jump to `done`
 * the moment the user focuses it. Unacknowledged `task_complete` still uses
 * the latch and does not time out into `done`.
 */
export function resolveWorkspaceAgentGroupKey(input: {
  agentState: AgentOccupancy;
  attentionReason: AttentionReason | null;
  groupingHoldActive?: boolean;
}): WorkspaceAgentGroupKey {
  const { agentState, attentionReason, groupingHoldActive } = input;

  if (
    agentState === "permission_request" ||
    attentionReason === "permission_request"
  ) {
    return "permission";
  }

  if (agentState === "running") {
    return "running";
  }

  if (attentionReason === "task_complete" || groupingHoldActive) {
    return "attention";
  }

  return "done";
}

/**
 * Refresh hydrate: live WS/stores always win when they are not the remainder.
 * Until sessions+attention finish loading, fall back to the API-memory snapshot.
 */
export function resolveHydratedWorkspaceAgentGroupKey(input: {
  live: WorkspaceAgentGroupKey;
  server?: WorkspaceAgentGroupKey;
  statusHydrated: boolean;
}): WorkspaceAgentGroupKey {
  if (input.live !== "done") return input.live;
  if (!input.statusHydrated && input.server && input.server !== "done") {
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
  agentState: AgentOccupancy;
  attentionReason: AttentionReason | null;
  attentionFilterMode: boolean;
}): WorkspaceAgentStatusView {
  const { agentState, attentionReason, attentionFilterMode } = input;

  if (attentionFilterMode && attentionReason) {
    return { kind: "attention", reason: attentionReason };
  }

  if (agentState === "permission_request") {
    return { kind: "permission", state: "permission_request" };
  }

  if (agentState === "running") {
    return { kind: "running", state: "running" };
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
