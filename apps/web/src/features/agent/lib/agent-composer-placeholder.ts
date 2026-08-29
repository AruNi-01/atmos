const LIVE_RUNTIME_STATUSES = new Set([
  "starting",
  "ready",
  "running_turn",
  "waiting_permission",
]);

export type AgentComposerPlaceholderKind =
  | "unavailable"
  | "selectAgent"
  | "createSession"
  | "resumeSession"
  | "connected";

export function isLiveAgentRuntimeStatus(status: string | null | undefined): boolean {
  return LIVE_RUNTIME_STATUSES.has((status ?? "").trim());
}

export function resolveAgentComposerPlaceholderKind({
  canUseCurrentMode,
  agentName,
  chatId,
  runtimeStatus,
  hasPersistenceHandle,
}: {
  canUseCurrentMode: boolean;
  agentName: string | null | undefined;
  chatId: string | null | undefined;
  runtimeStatus: string | null | undefined;
  hasPersistenceHandle: boolean;
}): AgentComposerPlaceholderKind {
  if (!canUseCurrentMode) return "unavailable";
  if (!agentName?.trim()) return "selectAgent";
  if (isLiveAgentRuntimeStatus(runtimeStatus)) return "connected";
  if (chatId?.trim() && hasPersistenceHandle) return "resumeSession";
  return "createSession";
}
