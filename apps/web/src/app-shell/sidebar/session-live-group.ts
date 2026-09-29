import type { PaneAttention } from "@/features/agent/store/agent-attention-store";
import type { AgentStatusRecord } from "@/features/agent/store/agent-status-store";
import {
  resolveWorkspaceAgentGroupKey,
  type WorkspaceAgentGroupKey,
} from "@/features/agent/lib/workspace-agent-status";

/**
 * Session rows follow the live agent stores. A snapshot can still say
 * need-attention or need-permission after a click or pointer move has already
 * cleared that latch in agent state.
 */
export function sessionLiveGroupKey(
  sessionId: string,
  snapshotGroupKey: WorkspaceAgentGroupKey,
  sessions: ReadonlyMap<string, AgentStatusRecord>,
  panes: ReadonlyMap<string, PaneAttention>,
  statusHydrated: boolean,
  groupingHoldActive = false,
): WorkspaceAgentGroupKey {
  const live = findLiveSession(sessionId, sessions);
  const attentionReason = findAttentionReason(sessionId, live, panes);
  const key = resolveWorkspaceAgentGroupKey({
    agentState: live?.state ?? "idle",
    attentionReason,
    groupingHoldActive,
  });
  if (key !== "done") return key;
  if (
    !statusHydrated &&
    (snapshotGroupKey === "attention" || snapshotGroupKey === "permission")
  ) {
    return snapshotGroupKey;
  }
  return "done";
}

function findLiveSession(
  sessionId: string,
  sessions: ReadonlyMap<string, AgentStatusRecord>,
): AgentStatusRecord | null {
  const direct = sessions.get(sessionId);
  if (direct) return direct;
  for (const row of sessions.values()) {
    if (row.pane_id === sessionId || row.session_id === sessionId) return row;
  }
  return null;
}

function findAttentionReason(
  sessionId: string,
  live: AgentStatusRecord | null,
  panes: ReadonlyMap<string, PaneAttention>,
): PaneAttention["reason"] | null {
  const keys = [sessionId, live?.session_id, live?.pane_id];
  let reason: PaneAttention["reason"] | null = null;
  for (const key of keys) {
    if (!key) continue;
    const pane = panes.get(key);
    if (!pane) continue;
    if (pane.reason === "permission_request") return pane.reason;
    reason = pane.reason;
  }
  for (const pane of panes.values()) {
    const matches =
      pane.sessionId === sessionId ||
      pane.stablePaneId === sessionId ||
      (live != null &&
        (pane.sessionId === live.session_id || pane.stablePaneId === live.pane_id));
    if (!matches) continue;
    if (pane.reason === "permission_request") return pane.reason;
    reason = pane.reason;
  }
  return reason;
}
