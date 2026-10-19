export const AGENT_CHAT_RESYNC_RETRY_MAX = 3;
export const AGENT_CHAT_RESYNC_RETRY_BASE_MS = 400;

export type AgentChatHydrateExit = "success" | "error" | "cancelled";

/** Failed or cancelled hydrate must leave the pump in live mode. */
export function shouldAbandonAgentChatHydrate(exit: AgentChatHydrateExit): boolean {
  return exit !== "success";
}

/** Delay before the next snapshot resync, or null when retries are exhausted. */
export function nextAgentChatResyncDelayMs(failedAttemptCount: number): number | null {
  if (failedAttemptCount >= AGENT_CHAT_RESYNC_RETRY_MAX) return null;
  return AGENT_CHAT_RESYNC_RETRY_BASE_MS * 2 ** failedAttemptCount;
}
