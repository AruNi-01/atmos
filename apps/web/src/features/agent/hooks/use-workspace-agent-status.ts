"use client";

import { useMemo } from "react";
import {
  AGENT_STATE,
  useAgentStatusStore,
  type AgentOccupancy,
} from "@/features/agent/store/agent-status-store";
import {
  selectAttentionFilterMode,
  useAgentAttentionStore,
  type AttentionReason,
} from "@/features/agent/store/agent-attention-store";
import { useWorkspaceAgentGroupingHoldStore } from "@/features/agent/store/workspace-agent-grouping-hold";
import { contextOccupancyFingerprint } from "@/features/agent/lib/agent-status-fingerprint";
import {
  parseWorkspaceAgentGroupKey,
  resolveHydratedWorkspaceAgentGroupKey,
  resolveRolledAttentionReason,
  resolveRolledOccupancy,
  resolveWorkspaceAgentGroupKey,
  resolveWorkspaceAgentStatusView,
  type WorkspaceAgentGroupKey,
  type WorkspaceAgentStatusView,
} from "@/features/agent/lib/workspace-agent-status";

export type WorkspaceAgentStatusSnapshot = {
  view: WorkspaceAgentStatusView;
  agentState: AgentOccupancy;
  attentionReason: AttentionReason | null;
};

/**
 * Subscribe to live agent-hook state + sticky attention for one context
 * (workspace GUID or project GUID). List surfaces (sidebar / kanban / search)
 * should use this instead of wiring the two stores themselves.
 */
export function useWorkspaceAgentStatus(
  contextId: string | null | undefined,
): WorkspaceAgentStatusSnapshot {
  const agentState = useAgentStatusStore((s) =>
    contextId ? s.getAgentStateForContextId(contextId) : AGENT_STATE.IDLE,
  );
  const attentionReason = useAgentAttentionStore((s) =>
    contextId ? s.getContextReason(contextId) : null,
  );
  const attentionFilterMode = useAgentAttentionStore(selectAttentionFilterMode);

  return useMemo(
    () => ({
      agentState,
      attentionReason,
      view: resolveWorkspaceAgentStatusView({
        agentState,
        attentionReason,
        attentionFilterMode,
      }),
    }),
    [agentState, attentionReason, attentionFilterMode],
  );
}

/**
 * Live Agent grouping keys for many workspace/project context ids.
 * Recomputes when hook sessions, sticky attention, or grouping hold change.
 */
export function useWorkspaceAgentGroupKeyMap(
  contextIds: readonly string[],
): Readonly<Record<string, WorkspaceAgentGroupKey>> {
  const occupancyKey = useAgentStatusStore((s) =>
    contextOccupancyFingerprint(s.sessions, contextIds),
  );
  const serverWorkspaceGroupKeys = useAgentStatusStore(
    (s) => s.serverWorkspaceGroupKeys,
  );
  const statusHydrated = useAgentStatusStore((s) => s.statusHydrated);
  const attentionRevision = useAgentAttentionStore((s) => s.revision);
  const groupingHoldRevision = useWorkspaceAgentGroupingHoldStore(
    (s) => s.revision,
  );
  const idsKey = contextIds.join("\n");

  return useMemo(() => {
    const status = useAgentStatusStore.getState();
    const attention = useAgentAttentionStore.getState();
    const groupingHold = useWorkspaceAgentGroupingHoldStore.getState();
    const map: Record<string, WorkspaceAgentGroupKey> = {};
    if (!idsKey) return map;
    for (const id of idsKey.split("\n")) {
      if (!id) continue;
      const live = resolveWorkspaceAgentGroupKey({
        agentState: status.getAgentStateForContextId(id),
        attentionReason: attention.getContextReason(id),
        groupingHoldActive: groupingHold.isHoldActive(id),
      });
      const serverRaw = status.serverWorkspaceGroupKeys[id];
      map[id] = resolveHydratedWorkspaceAgentGroupKey({
        live,
        server: serverRaw ? parseWorkspaceAgentGroupKey(serverRaw) : undefined,
        statusHydrated: status.statusHydrated,
      });
    }
    return map;
  }, [
    attentionRevision,
    groupingHoldRevision,
    statusHydrated,
    occupancyKey,
    idsKey,
    serverWorkspaceGroupKeys,
  ]);
}

/**
 * Project row status. `rollupChildren` folds child occupancy + attention into
 * a collapsed one-column project. Leave it off when workspace rows are listed.
 */
export function useProjectAgentStatusRollup(
  projectId: string | null | undefined,
  workspaceIds: readonly string[],
  options?: { rollupChildren?: boolean },
): WorkspaceAgentStatusSnapshot {
  const rollupChildren = options?.rollupChildren === true;
  const agentState = useAgentStatusStore((s) => {
    if (!projectId) return AGENT_STATE.IDLE;
    if (!rollupChildren) return s.getAgentStateForContextId(projectId);
    const states: AgentOccupancy[] = [s.getAgentStateForContextId(projectId)];
    for (const workspaceId of workspaceIds) {
      states.push(s.getAgentStateForContextId(workspaceId));
    }
    return resolveRolledOccupancy(states);
  });
  const attentionFilterMode = useAgentAttentionStore(selectAttentionFilterMode);
  const attentionReason = useAgentAttentionStore((s) => {
    if (!projectId) return null;
    if (!rollupChildren) return s.getContextReason(projectId);
    const reasons: Array<AttentionReason | null> = [s.getContextReason(projectId)];
    for (const workspaceId of workspaceIds) {
      reasons.push(s.getContextReason(workspaceId));
    }
    return resolveRolledAttentionReason(reasons);
  });

  return useMemo(
    () => ({
      agentState,
      attentionReason,
      view: resolveWorkspaceAgentStatusView({
        agentState,
        attentionReason,
        attentionFilterMode,
      }),
    }),
    [agentState, attentionReason, attentionFilterMode],
  );
}
