import type { AgentChatEvent } from "@atmos/api-types/ws/dto/agent-chat";

export function eventsForChat(event: AgentChatEvent, chatId: string): boolean {
  return event.chat_id === chatId;
}

export function agentChatEventFromMessage(message: unknown): AgentChatEvent | null {
  if (!message || typeof message !== "object") return null;
  const envelope = message as {
    type?: unknown;
    payload?: { event?: unknown; data?: unknown };
  };
  if (envelope.type !== "notification" || envelope.payload?.event !== "agent_chat_event") {
    return null;
  }
  const data = envelope.payload.data;
  if (!data || typeof data !== "object") return null;
  const event = data as Partial<AgentChatEvent>;
  if (typeof event.chat_id !== "string") return null;
  if (!event.payload || typeof event.payload !== "object" || !("type" in event.payload)) return null;
  return data as AgentChatEvent;
}
