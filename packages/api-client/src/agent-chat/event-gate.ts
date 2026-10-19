import type { AgentChatEvent, AgentChatPayload } from "@atmos/api-types/ws/dto/agent-chat";

/** Seen emission ring. Sized above the server recent-event cap (2048). */
export const AGENT_CHAT_EVENT_ID_WINDOW = 4096;

/**
 * Revision hole that should trigger a snapshot resync rather than subscribe
 * catch-up. Small holes are treated as in-flight reordering.
 */
export const AGENT_CHAT_REVISION_GAP_RESYNC = 32;

export type AgentChatGateDropReason = "duplicate_event_id" | "stale_state";

export type AgentChatGateGapRecommend = "catch_up" | "resync";

export type AgentChatGateGap = {
  from: number;
  to: number;
  size: number;
  recommend: AgentChatGateGapRecommend;
};

export type AgentChatGateDecision = {
  action: "apply" | "drop";
  event: AgentChatEvent;
  reason?: AgentChatGateDropReason;
  gap?: AgentChatGateGap;
};

export type AgentChatEventGateOptions = {
  eventIdWindow?: number;
  gapResyncThreshold?: number;
};

export type AgentChatEventGate = {
  readonly cursor: number;
  readonly maxRevision: number;
  admit(event: AgentChatEvent): AgentChatGateDecision;
  observeSnapshot(lastEventSeq: number): void;
  shouldResyncFromServer(serverLastSeq: number): boolean;
  reset(): void;
};

/**
 * Last-write-wins chrome. Text/tool events are null: they are idempotent in
 * the part fold and must not be dropped by a revision floor.
 */
export function agentChatEventStateKey(payload: AgentChatPayload): string | null {
  switch (payload.type) {
    case "turn_started":
    case "turn_completed":
      return "turn";
    case "permission_requested":
    case "permission_resolved":
      return "permission";
    case "session_op_requested":
    case "session_op_resolved":
      return "session_op";
    case "queue_updated":
      return "queue";
    case "turn_snapshot":
      return `turn_snapshot:${payload.turn_id}`;
    case "plan_updated":
      return "plan";
    case "usage_updated":
      return "usage";
    case "context_usage_updated":
      return "context_usage";
    case "runtime_status":
      return "runtime_status";
    case "title_updated":
      return "title";
    case "available_commands_updated":
      return "commands";
    case "grok_goal_updated":
      return "grok_goal";
    case "grok_workflow_updated":
      return "grok_workflow";
    case "config_updated":
      return "config";
    case "rewind_view_updated":
      return "rewind";
    case "session_lifecycle":
      return `session_lifecycle:${payload.turn_id}`;
    case "session_config_change":
      return `session_config_change:${payload.turn_id}`;
    case "session_hint":
      return `session_hint:${payload.message_id}:${payload.kind}`;
    case "user_message":
    case "text_chunk":
    case "part_closed":
    case "tool_call_started":
    case "tool_call_updated":
    case "tool_call_completed":
    case "tool_call_failed":
    case "session_forked":
    case "unknown":
      return null;
  }
}

function payloadInstanceKey(payload: AgentChatPayload): string {
  switch (payload.type) {
    case "part_closed":
      return payload.part_id;
    case "text_chunk":
      return `${payload.part_id}:${payload.offset}`;
    case "tool_call_started":
    case "tool_call_updated":
    case "tool_call_completed":
    case "tool_call_failed":
      return payload.tool_call.tool_call_id;
    case "turn_started":
    case "turn_completed":
    case "turn_snapshot":
    case "session_lifecycle":
    case "session_config_change":
      return payload.turn_id;
    case "user_message":
      return payload.message_id;
    case "permission_requested":
      return payload.request.request_id;
    case "permission_resolved":
      return payload.request_id;
    case "session_op_requested":
      return payload.request.request_id;
    case "session_op_resolved":
      return payload.request_id;
    case "session_hint":
      return `${payload.message_id}:${payload.kind}`;
    case "session_forked":
      return payload.chat_id;
    case "unknown":
      return payload.event_type;
    case "plan_updated":
    case "usage_updated":
    case "context_usage_updated":
    case "queue_updated":
    case "runtime_status":
    case "title_updated":
    case "available_commands_updated":
    case "grok_goal_updated":
    case "grok_workflow_updated":
    case "config_updated":
    case "rewind_view_updated":
      return "";
  }
}

function eventIdOf(event: AgentChatEvent): string {
  return typeof event.event_id === "string" ? event.event_id : "";
}

/**
 * Identity of one emitted payload. Adapter `event_id` is reused across
 * payloads from the same envelope (`SessionStarted`, `finish_turn`), so the
 * key includes type and a per-payload instance id.
 */
export function agentChatEventDuplicateKey(event: AgentChatEvent): string {
  const id = eventIdOf(event);
  if (id.length === 0) return "";
  return `${id}\0${event.payload.type}\0${payloadInstanceKey(event.payload)}`;
}

function revisionOf(event: AgentChatEvent): number {
  return event.revision ?? 0;
}

function gapFor(
  contiguous: number,
  revision: number,
  threshold: number,
): AgentChatGateGap | undefined {
  if (revision <= contiguous + 1) return undefined;
  const from = contiguous + 1;
  const to = revision - 1;
  const size = to - from + 1;
  return {
    from,
    to,
    size,
    recommend: size >= threshold ? "resync" : "catch_up",
  };
}

export function createAgentChatEventGate(
  options: AgentChatEventGateOptions = {},
): AgentChatEventGate {
  const eventIdWindow = options.eventIdWindow ?? AGENT_CHAT_EVENT_ID_WINDOW;
  const gapResyncThreshold = options.gapResyncThreshold ?? AGENT_CHAT_REVISION_GAP_RESYNC;

  const seenIds = new Set<string>();
  const seenIdOrder: string[] = [];
  const stateRevision = new Map<string, number>();
  const pendingRevisions = new Set<number>();

  let snapshotFloor = 0;
  let contiguous = 0;
  let maxRevision = 0;

  function rememberDuplicateKey(key: string): boolean {
    if (key.length === 0) return false;
    if (seenIds.has(key)) return true;
    seenIds.add(key);
    seenIdOrder.push(key);
    if (seenIdOrder.length > eventIdWindow) {
      const oldest = seenIdOrder.shift();
      if (oldest) seenIds.delete(oldest);
    }
    return false;
  }

  function noteRevision(revision: number): void {
    if (revision > maxRevision) maxRevision = revision;
    if (revision <= contiguous) return;
    pendingRevisions.add(revision);
    while (pendingRevisions.has(contiguous + 1)) {
      pendingRevisions.delete(contiguous + 1);
      contiguous += 1;
    }
  }

  function lastStateRevision(key: string): number {
    return Math.max(stateRevision.get(key) ?? 0, snapshotFloor);
  }

  function observeSnapshot(lastEventSeq: number): void {
    const seq = lastEventSeq > 0 ? lastEventSeq : 0;
    if (seq > snapshotFloor) snapshotFloor = seq;
    if (seq > maxRevision) maxRevision = seq;
    if (seq > contiguous) {
      contiguous = seq;
      for (const revision of [...pendingRevisions]) {
        if (revision <= contiguous) pendingRevisions.delete(revision);
      }
      while (pendingRevisions.has(contiguous + 1)) {
        pendingRevisions.delete(contiguous + 1);
        contiguous += 1;
      }
    }
  }

  function admit(event: AgentChatEvent): AgentChatGateDecision {
    if (rememberDuplicateKey(agentChatEventDuplicateKey(event))) {
      return { action: "drop", event, reason: "duplicate_event_id" };
    }

    const revision = revisionOf(event);
    noteRevision(revision);
    const gap = gapFor(contiguous, revision, gapResyncThreshold);
    const key = agentChatEventStateKey(event.payload);
    if (key && revision < lastStateRevision(key)) {
      return { action: "drop", event, reason: "stale_state", gap };
    }
    if (key) stateRevision.set(key, Math.max(lastStateRevision(key), revision));
    return gap ? { action: "apply", event, gap } : { action: "apply", event };
  }

  return {
    get cursor() {
      return contiguous;
    },
    get maxRevision() {
      return maxRevision;
    },
    admit,
    observeSnapshot,
    shouldResyncFromServer(serverLastSeq: number) {
      return serverLastSeq - contiguous >= gapResyncThreshold;
    },
    reset() {
      seenIds.clear();
      seenIdOrder.length = 0;
      stateRevision.clear();
      pendingRevisions.clear();
      snapshotFloor = 0;
      contiguous = 0;
      maxRevision = 0;
    },
  };
}
