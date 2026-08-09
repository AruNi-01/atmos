"use client";

import { AgentAttentionIndicator } from "@/features/agent/components/AgentAttentionIndicator";
import { AgentHookStatusIndicator } from "@/features/agent/components/AgentHookStatusIndicator";
import { useAgentAttentionStore } from "@/features/agent/store/agent-attention-store";
import { AGENT_STATE, useAgentHooksStore } from "@/features/agent/store/agent-hooks-store";

/**
 * Live agent-hook status + sticky need-attention for one terminal pane.
 * Shared by center-stage mosaic panes and canvas terminal cards — both must
 * pass the same stable pane id (`{contextId}:{tmuxWindowName}`).
 */
export function TerminalPaneAgentStatus({
  paneId,
}: {
  paneId: string;
  /** Kept for call-site compatibility; status is pane-scoped only. */
  contextId: string;
}) {
  // Only show status for this specific pane – do NOT fall back to context-level
  // state, which would cause all windows in the same workspace to show RUNNING
  // whenever any one of them has an agent active.
  const paneState = useAgentHooksStore((s) => s.getAgentStateForPaneId(paneId));
  const attentionReason = useAgentAttentionStore((s) => s.panes.get(paneId)?.reason ?? null);

  if (paneState !== AGENT_STATE.IDLE) {
    return (
      <AgentHookStatusIndicator
        state={paneState}
        variant="full"
        placement="terminal_panel"
        className="shrink-0"
      />
    );
  }

  if (attentionReason) {
    return <AgentAttentionIndicator reason={attentionReason} className="shrink-0" size={14} />;
  }

  return null;
}
