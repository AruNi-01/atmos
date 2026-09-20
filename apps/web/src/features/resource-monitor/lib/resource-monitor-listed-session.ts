import type { ResourceSessionMetrics } from "@atmos/api-types/ws/dto/resource-monitor";
import type { AgentStatusRecord } from "@/features/agent/store/agent-status-store";

export type ResourceMonitorSessionUiKind = "tui" | "chat";

export type ResourceMonitorListedSession = ResourceSessionMetrics & {
  uiKind: ResourceMonitorSessionUiKind;
  agentStatus?: AgentStatusRecord;
  spaceId?: string | null;
};

export function parseResourceMonitorChatId(
  sessionId: string | null | undefined,
): string | null {
  const id = sessionId?.trim() ?? "";
  if (!id.startsWith("chat:")) return null;
  return id.slice("chat:".length) || null;
}

export function isResourceMonitorChatSession(
  session: ResourceSessionMetrics,
): session is ResourceMonitorListedSession {
  const listed = session as ResourceMonitorListedSession;
  return (
    listed.uiKind === "chat" ||
    session.terminal_kind === "chat" ||
    parseResourceMonitorChatId(session.session_id) != null
  );
}

export function resourceMonitorSessionUiKind(
  session: ResourceSessionMetrics,
): ResourceMonitorSessionUiKind {
  return isResourceMonitorChatSession(session) ? "chat" : "tui";
}

export function agentStatusForResourceMonitorChat(
  session: ResourceSessionMetrics,
  hostId: string,
): AgentStatusRecord | null {
  const listed = session as ResourceMonitorListedSession;
  if (listed.agentStatus?.context_id?.trim()) {
    return listed.agentStatus;
  }
  const chatId =
    listed.agentStatus?.surface_id?.trim() ||
    parseResourceMonitorChatId(session.session_id);
  const contextId = hostId.trim();
  if (!chatId || !contextId) return null;
  return {
    session_id: session.session_id.startsWith("chat:")
      ? session.session_id
      : `chat:${chatId}`,
    tool: listed.agentStatus?.tool ?? "agent",
    state: listed.agentStatus?.state ?? "idle",
    timestamp: listed.agentStatus?.timestamp ?? new Date(0).toISOString(),
    context_id: contextId,
    surface: "chat",
    surface_id: chatId,
    space_id: listed.spaceId ?? listed.agentStatus?.space_id ?? undefined,
    provider_id: listed.agentStatus?.provider_id ?? null,
  };
}

export function canLocateResourceMonitorChatSession(
  session: ResourceSessionMetrics,
  hostId?: string,
): boolean {
  return agentStatusForResourceMonitorChat(session, hostId ?? "") != null;
}
