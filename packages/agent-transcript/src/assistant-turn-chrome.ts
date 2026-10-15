import type { AgentMessage, AgentPart } from "@atmos/api-types/ws/dto/agent-chat";

/** Session chrome only — create/resume finished but the turn has not produced answer/tools yet. */
export function isSessionChromeOnly(parts: AgentPart[]): boolean {
  if (parts.length === 0) return true;
  return parts.every(
    (part) =>
      part.type === "session_lifecycle" ||
      part.type === "session_config_change" ||
      part.type === "session_hint",
  );
}

/**
 * Copy / worked-for / usage footer under an assistant row.
 * Must not flash after session create: chrome-only rows and live `worked_ms`
 * without `completed_at` are still in-flight.
 */
export function shouldShowAssistantTurnEndedChrome(
  message: Pick<AgentMessage, "streaming" | "parts" | "worked_ms" | "completed_at" | "usage">,
  assistantText: string,
): boolean {
  if (message.streaming) return false;
  if (isSessionChromeOnly(message.parts)) return false;
  // Closed preamble text after tools is still in-flight. Copy / timestamp
  // chrome waits for `turn_completed` so a later final answer does not look
  // like a finished turn.
  if (!message.completed_at) return false;
  if (assistantText.trim()) return true;
  if (message.usage) return true;
  return message.worked_ms != null && message.worked_ms > 0;
}
