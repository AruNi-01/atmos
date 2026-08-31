import type { AgentChatSnapshot, AgentMessage } from "@atmos/api-types/ws/dto/agent-chat";

export function formatWorkDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours > 0) return `${hours}h${minutes}m${seconds}s`;
  if (minutes > 0) return `${minutes}m${seconds}s`;
  return `${seconds}s`;
}

/** Whole seconds for the Reasoning trigger. Live streaming uses the same ceil. */
export function thinkingDurationSeconds(thinkingMs: number | null | undefined): number | undefined {
  if (thinkingMs == null || thinkingMs <= 0) return undefined;
  return Math.max(1, Math.ceil(thinkingMs / 1000));
}

/** Prefer this block's duration. Fall back to the turn total only when it is the sole thinking part. */
export function thinkingBlockDurationMs(
  part: { type: string; duration_ms?: number | null },
  parts: Array<{ type: string; duration_ms?: number | null }>,
  messageThinkingMs?: number | null,
): number | undefined {
  if (part.type !== "thinking") return undefined;
  if (part.duration_ms != null && part.duration_ms > 0) return part.duration_ms;
  const thinkingCount = parts.filter((item) => item.type === "thinking").length;
  if (thinkingCount <= 1) return messageThinkingMs ?? undefined;
  return undefined;
}

export function formatWorkedAt(value: string | null | undefined, locale: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const resolved = locale.toLowerCase().startsWith("zh") ? "zh-CN" : locale;
  return date.toLocaleString(resolved, {
    year: "numeric",
    month: resolved.startsWith("zh") ? "numeric" : "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function isLiveAssistantTurn(message: AgentMessage | undefined): boolean {
  return Boolean(message?.role === "assistant" && message.streaming);
}

/** Server-owned elapsed for the in-flight turn. Frontend ticks from this after hydrate. */
export function snapshotLiveElapsedMs(
  snapshot: Pick<AgentChatSnapshot, "running_turn_started_at" | "messages">,
  now = Date.now(),
): number | null {
  const last = snapshot.messages?.at(-1);
  const live = isLiveAssistantTurn(last) || Boolean(snapshot.running_turn_started_at);
  if (!live) return null;
  if (last?.role === "assistant" && last.worked_ms != null && last.worked_ms >= 0) {
    return last.worked_ms;
  }
  if (snapshot.running_turn_started_at) {
    const started = Date.parse(snapshot.running_turn_started_at);
    if (!Number.isNaN(started)) return Math.max(0, now - started);
  }
  return 0;
}

export function clockFromElapsedMs(elapsedMs: number, now = Date.now()): number {
  return now - Math.max(0, elapsedMs);
}

/** Compact hover timestamp under a user bubble, e.g. "Jul 29, 9:23 AM". */
export function formatUserMessageTime(
  value: string | null | undefined,
  locale: string,
): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || date.getUTCFullYear() < 2000) return null;
  const resolved = locale.toLowerCase().startsWith("zh") ? "zh-CN" : locale;
  return date.toLocaleString(resolved, {
    month: resolved.startsWith("zh") ? "numeric" : "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
