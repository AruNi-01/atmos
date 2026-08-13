"use client";

import { useMemo } from "react";
import {
  AGENT_STATE,
  useAgentHooksStore,
  type AgentHookState,
} from "@/features/agent/store/agent-hooks-store";
import {
  selectAttentionFilterMode,
  useAgentAttentionStore,
  type AttentionReason,
} from "@/features/agent/store/agent-attention-store";
import {
  resolveRolledAttentionReason,
  resolveWorkspaceAgentGroupKey,
  resolveWorkspaceAgentStatusView,
  type WorkspaceAgentGroupKey,
  type WorkspaceAgentStatusView,
} from "@/features/agent/lib/workspace-agent-status";

export type WorkspaceAgentStatusSnapshot = {
  view: WorkspaceAgentStatusView;
  agentState: AgentHookState;
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
  const agentState = useAgentHooksStore((s) =>
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
 * Recomputes when hook sessions or sticky attention revision change.
 */
export function useWorkspaceAgentGroupKeyMap(
  contextIds: readonly string[],
): Readonly<Record<string, WorkspaceAgentGroupKey>> {
  const sessions = useAgentHooksStore((s) => s.sessions);
  const serverWorkspaceGroupKeys = useAgentHooksStore(
    (s) => s.serverWorkspaceGroupKeys,
  );
  const hooksHydrated = useAgentHooksStore((s) => s.hooksHydrated);
  const attentionRevision = useAgentAttentionStore((s) => s.revision);
  const idsKey = contextIds.join("\n");

  return useMemo(() => {
    const hooks = useAgentHooksStore.getState();
    const attention = useAgentAttentionStore.getState();
    const map: Record<string, WorkspaceAgentGroupKey> = {};
    if (!idsKey) return map;
    for (const id of idsKey.split("\n")) {
      if (!id) continue;
      const live = resolveWorkspaceAgentGroupKey({
        agentState: hooks.getAgentStateForContextId(id),
        attentionReason: attention.getContextReason(id),
      });
      const server = hooks.serverWorkspaceGroupKeys[id] as
        | WorkspaceAgentGroupKey
        | undefined;
      // Before hydrate finishes, prefer the API-memory snapshot so a refresh
      // does not flash every workspace as Idle.
      map[id] = !hooks.hooksHydrated && server ? server : live;
    }
    return map;
  }, [
    attentionRevision,
    hooksHydrated,
    idsKey,
    serverWorkspaceGroupKeys,
    sessions,
  ]);
}

/**
 * Project row status. When `rollupAttention` is true (project collapsed),
 * sticky attention is rolled up across the project and its workspaces.
 * Live agent state always comes from the project context id only.
 */
export function useProjectAgentStatusRollup(
  projectId: string | null | undefined,
  workspaceIds: readonly string[],
  options?: { rollupAttention?: boolean },
): WorkspaceAgentStatusSnapshot {
  const rollupAttention = options?.rollupAttention === true;
  const agentState = useAgentHooksStore((s) =>
    projectId ? s.getAgentStateForContextId(projectId) : AGENT_STATE.IDLE,
  );
  const attentionFilterMode = useAgentAttentionStore(selectAttentionFilterMode);
  const attentionReason = useAgentAttentionStore((s) => {
    if (!projectId) return null;
    if (!rollupAttention) return s.getContextReason(projectId);
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
