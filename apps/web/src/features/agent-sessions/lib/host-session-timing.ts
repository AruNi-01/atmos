import type { AgentMessage, AgentPart } from "@atmos/api-types/ws/dto/agent-chat";
import { promptToCompleteMs } from "@/features/agent/lib/agent-chat-timing";

function usableTimestamp(value?: string | null): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || date.getUTCFullYear() < 2000) return undefined;
  return value;
}

function isPreviewNow(value?: string | null, now = Date.now()): boolean {
  const usable = usableTimestamp(value);
  if (!usable) return false;
  return now - Date.parse(usable) < 5_000;
}

function completeOpenHostTools(parts: AgentPart[]): AgentPart[] {
  let changed = false;
  const next = parts.map((part) => {
    if (part.type !== "tool_call") return part;
    const status = part.status?.toLowerCase();
    if (status !== "running" && status !== "pending") return part;
    changed = true;
    return { ...part, status: "completed" as const };
  });
  return changed ? next : parts;
}

/** Historic preview: close the live-turn flags and stamp user prompt → last reply. */
export function fillHostSessionTurnTiming(
  messages: readonly AgentMessage[],
  lastReplyAt?: string | null,
): AgentMessage[] {
  const now = Date.now();
  return messages.map((message, index) => {
    if (message.role !== "assistant") {
      return message.streaming ? { ...message, streaming: false } : message;
    }
    const start = [...messages.slice(0, index)]
      .reverse()
      .find((item) => item.role === "user")
      ?.created_at;
    const nextUserAt = messages.slice(index + 1).find((item) => item.role === "user")?.created_at;
    const startUsable = usableTimestamp(start);
    const startIsOld = Boolean(startUsable && now - Date.parse(startUsable) > 60_000);
    const lastAssistant = !messages.slice(index + 1).some((item) => item.role === "assistant");
    let end = usableTimestamp(message.completed_at) ?? usableTimestamp(message.created_at);
    if (end && startIsOld && isPreviewNow(end, now)) {
      end = undefined;
    }
    const keepServerWorked =
      message.worked_ms != null
      && message.worked_ms > 0
      && !(startIsOld && isPreviewNow(message.completed_at, now));
    let worked = keepServerWorked ? message.worked_ms : promptToCompleteMs(start, end);
    if (worked == null) {
      worked = promptToCompleteMs(start, nextUserAt);
      if (worked != null && !(usableTimestamp(message.completed_at) && !isPreviewNow(message.completed_at, now))) {
        end = usableTimestamp(nextUserAt) ?? end;
      }
    }
    if (worked == null && lastAssistant) {
      const reply = usableTimestamp(lastReplyAt);
      if (reply && !(startIsOld && isPreviewNow(reply, now))) {
        worked = promptToCompleteMs(start, reply);
        if (worked != null) end = reply;
      }
    }
    const parts = completeOpenHostTools(message.parts);
    const completedAt =
      (usableTimestamp(message.completed_at) && !isPreviewNow(message.completed_at, now)
        ? usableTimestamp(message.completed_at)
        : undefined)
      ?? end
      ?? startUsable
      ?? null;
    if (
      !message.streaming
      && message.completed_at === completedAt
      && message.worked_ms === (worked ?? message.worked_ms)
      && parts === message.parts
    ) {
      return message;
    }
    return {
      ...message,
      streaming: false,
      completed_at: completedAt,
      worked_ms: worked ?? (keepServerWorked ? message.worked_ms : undefined),
      parts,
    };
  });
}
