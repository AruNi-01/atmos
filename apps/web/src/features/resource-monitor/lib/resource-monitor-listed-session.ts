import type { ResourceSessionMetrics } from "@atmos/api-types/ws/dto/resource-monitor";
import type { AgentStatusRecord } from "@/features/agent/store/agent-status-store";

export type ResourceMonitorSessionUiKind = "tui" | "chat";

export type ResourceMonitorListedSession = ResourceSessionMetrics & {
  uiKind: ResourceMonitorSessionUiKind;
  agentStatus?: AgentStatusRecord;
  spaceId?: string | null;
};

export function isResourceMonitorChatSession(
  session: ResourceSessionMetrics,
): session is ResourceMonitorListedSession {
  return (session as ResourceMonitorListedSession).uiKind === "chat";
}

export function resourceMonitorSessionUiKind(
  session: ResourceSessionMetrics,
): ResourceMonitorSessionUiKind {
  return isResourceMonitorChatSession(session) ? "chat" : "tui";
}

export function canLocateResourceMonitorChatSession(
  session: ResourceSessionMetrics,
): boolean {
  if (!isResourceMonitorChatSession(session)) return false;
  const status = session.agentStatus;
  if (!status?.context_id?.trim()) return false;
  const chatId =
    status.surface_id?.trim() ||
    (status.session_id.startsWith("chat:")
      ? status.session_id.slice("chat:".length)
      : "");
  return Boolean(chatId.trim());
}
