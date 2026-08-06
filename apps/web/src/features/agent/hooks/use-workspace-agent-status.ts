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
  resolveWorkspaceAgentStatusView,
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
