import type { PaneAttention } from "@/features/agent/store/agent-attention-store";
import type { AgentStatusRecord } from "@/features/agent/store/agent-status-store";
import {
  resolveWorkspaceAgentGroupKey,
  resolveWorkspaceAgentStatusView,
  type WorkspaceAgentGroupKey,
  type WorkspaceAgentStatusView,
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

function chatIdFromSessionId(sessionId: string): string | null {
  if (!sessionId.startsWith("chat:")) return null;
  const id = sessionId.slice("chat:".length).trim();
  return id || null;
}

function sameSession(sessionId: string, record: AgentStatusRecord): boolean {
  if (record.session_id === sessionId || record.pane_id === sessionId) return true;
  const chatId = chatIdFromSessionId(sessionId);
  if (!chatId) return false;
  return record.surface === "chat" && record.surface_id === chatId;
}

function findLiveSession(
  sessionId: string,
  sessions: ReadonlyMap<string, AgentStatusRecord>,
): AgentStatusRecord | null {
  const direct = sessions.get(sessionId);
  if (direct) return direct;
  for (const row of sessions.values()) {
    if (sameSession(sessionId, row)) return row;
  }
  return null;
}

function attentionLookupKeys(
  sessionId: string,
  live: AgentStatusRecord | null,
): string[] {
  const keys = [sessionId, live?.session_id, live?.pane_id];
  const chatId =
    chatIdFromSessionId(sessionId) ??
    (live?.surface === "chat" ? live.surface_id?.trim() || null : null);
  if (chatId) keys.push(chatId, `chat:${chatId}`);
  return keys.filter((key): key is string => Boolean(key));
}

function findAttentionReason(
  sessionId: string,
  live: AgentStatusRecord | null,
  panes: ReadonlyMap<string, PaneAttention>,
): PaneAttention["reason"] | null {
  const keys = attentionLookupKeys(sessionId, live);
  let reason: PaneAttention["reason"] | null = null;
  for (const key of keys) {
    const pane = panes.get(key);
    if (!pane) continue;
    if (pane.reason === "permission_request") return pane.reason;
    reason = pane.reason;
  }
  const keySet = new Set(keys);
  for (const pane of panes.values()) {
    const matches =
      keySet.has(pane.sessionId) ||
      keySet.has(pane.stablePaneId) ||
      (live != null &&
        (pane.sessionId === live.session_id || pane.stablePaneId === live.pane_id));
    if (!matches) continue;
    if (pane.reason === "permission_request") return pane.reason;
    reason = pane.reason;
  }
  return reason;
}

/**
 * Same mark priority as a workspace row: filter overlay, then live
 * permission, then running, then a sticky attention bell.
 */
export function sessionAgentStatusView(
  sessionId: string,
  sessions: ReadonlyMap<string, AgentStatusRecord>,
  panes: ReadonlyMap<string, PaneAttention>,
  attentionFilterMode: boolean,
): WorkspaceAgentStatusView {
  const live = findLiveSession(sessionId, sessions);
  return resolveWorkspaceAgentStatusView({
    agentState: live?.state ?? "idle",
    attentionReason: findAttentionReason(sessionId, live, panes),
    attentionFilterMode,
  });
}

/**
 * Header attention filter for one session row.
 * Matches workspace `filterProjectsByAttention`: a latch (permission or task
 * complete) keeps the row. A running-only session stays hidden. Before agent
 * state hydrates, a snapshot still marked permission or attention stays visible.
 * `groupKey` is the already-resolved live bucket.
 */
export function sessionMatchesAttentionFilter(
  sessionId: string,
  groupKey: WorkspaceAgentGroupKey,
  sessions: ReadonlyMap<string, AgentStatusRecord>,
  panes: ReadonlyMap<string, PaneAttention>,
  statusHydrated: boolean,
): boolean {
  const live = findLiveSession(sessionId, sessions);
  if (findAttentionReason(sessionId, live, panes)) return true;
  if (
    !statusHydrated &&
    (groupKey === "attention" || groupKey === "permission")
  ) {
    return true;
  }
  return false;
}
