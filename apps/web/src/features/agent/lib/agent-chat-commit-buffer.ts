import type { AgentChatPayload } from "@atmos/api-types/ws/dto/agent-chat";

export const AGENT_CHAT_COMMIT_FLUSH_MS = 150;

export type AgentChatCommitCadence = "batch" | "flush";

export const HIGH_FREQUENCY_EVENT_KINDS = [
  "text_chunk",
  "part_closed",
  "tool_call_started",
  "tool_call_updated",
  "tool_call_completed",
  "tool_call_failed",
  "plan_updated",
  "usage_updated",
  "context_usage_updated",
] as const satisfies ReadonlyArray<AgentChatPayload["type"]>;

export type HighFrequencyEventKind = (typeof HIGH_FREQUENCY_EVENT_KINDS)[number];

export function classifyCommitCadence(
  type: AgentChatPayload["type"],
): AgentChatCommitCadence {
  switch (type) {
    case "text_chunk":
    case "part_closed":
    case "tool_call_started":
    case "tool_call_updated":
    case "tool_call_completed":
    case "tool_call_failed":
    case "plan_updated":
    case "usage_updated":
    case "context_usage_updated":
      return "batch";
    case "turn_started":
    case "user_message":
    case "permission_requested":
    case "permission_resolved":
    case "session_op_requested":
    case "session_op_resolved":
    case "session_forked":
    case "rewind_view_updated":
    case "turn_completed":
    case "queue_updated":
    case "runtime_status":
    case "title_updated":
    case "available_commands_updated":
    case "grok_goal_updated":
    case "grok_workflow_updated":
    case "config_updated":
    case "unknown":
    case "session_lifecycle":
    case "session_config_change":
    case "session_hint":
      return "flush";
  }
}

export type AgentChatCommitDecision = {
  cadence: AgentChatCommitCadence;
  dirty: boolean;
  flushed: boolean;
};

export type AgentChatCommitBuffer = {
  deliver: (type: AgentChatPayload["type"]) => AgentChatCommitDecision;
  maybeFlush: () => boolean;
  flush: () => boolean;
  isDirty: () => boolean;
  commitCount: () => number;
};

export function createAgentChatCommitBuffer(options: {
  onCommit: () => void;
  now?: () => number;
  flushMs?: number;
}): AgentChatCommitBuffer {
  const now = options.now ?? Date.now;
  const flushMs = options.flushMs ?? AGENT_CHAT_COMMIT_FLUSH_MS;
  let dirty = false;
  let lastFlushAt = now();
  let commits = 0;

  const flush = (): boolean => {
    if (!dirty) return false;
    dirty = false;
    lastFlushAt = now();
    commits += 1;
    options.onCommit();
    return true;
  };

  return {
    deliver(type) {
      const cadence = classifyCommitCadence(type);
      dirty = true;
      if (cadence === "flush") {
        flush();
        return { cadence, dirty: false, flushed: true };
      }
      return { cadence, dirty: true, flushed: false };
    },
    maybeFlush() {
      if (!dirty) return false;
      if (now() - lastFlushAt < flushMs) return false;
      return flush();
    },
    flush,
    isDirty: () => dirty,
    commitCount: () => commits,
  };
}
