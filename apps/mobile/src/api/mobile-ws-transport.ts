import type { AgentChatSnapshot } from "@atmos/api-types/ws/dto/agent-chat";

export type RelayCtrl = {
  code: string;
};

export type AgentChatCursor = {
  chat_id: string;
  after_sequence: number;
};

export const AGENT_CHAT_RESYNC_TYPE = "agent_chat_resync";

export type AgentChatResyncMessage = {
  type: typeof AGENT_CHAT_RESYNC_TYPE;
  chat_id: string;
  snapshot: AgentChatSnapshot;
};

export class NetworkUpdateGate {
  private generation = 0;

  nextAsync(): number {
    return ++this.generation;
  }

  live(): void {
    this.generation += 1;
  }

  isCurrent(id: number): boolean {
    return id === this.generation;
  }
}

export function lastEventSeqFromSubscribe(data: unknown): number | null {
  if (!data || typeof data !== "object") return null;
  const seq = (data as { last_event_seq?: unknown }).last_event_seq;
  return typeof seq === "number" && Number.isFinite(seq) ? seq : null;
}

export function agentChatResyncMessage(
  chatId: string,
  snapshot: AgentChatSnapshot,
): AgentChatResyncMessage {
  return { type: AGENT_CHAT_RESYNC_TYPE, chat_id: chatId, snapshot };
}

export function parseAgentChatResync(message: unknown): AgentChatResyncMessage | null {
  if (!message || typeof message !== "object") return null;
  const record = message as { type?: unknown; chat_id?: unknown; snapshot?: unknown };
  if (record.type !== AGENT_CHAT_RESYNC_TYPE) return null;
  if (typeof record.chat_id !== "string" || record.chat_id.length === 0) return null;
  if (!record.snapshot || typeof record.snapshot !== "object") return null;
  return {
    type: AGENT_CHAT_RESYNC_TYPE,
    chat_id: record.chat_id,
    snapshot: record.snapshot as AgentChatSnapshot,
  };
}

export function parseRelayCtrl(message: unknown): RelayCtrl | null {
  if (!message || typeof message !== "object") return null;
  const record = message as { type?: unknown; code?: unknown };
  if (record.type !== "relay_ctrl") return null;
  const code =
    typeof record.code === "string" && record.code.trim().length > 0
      ? record.code.trim()
      : "server_offline";
  return { code };
}

export function agentChatCursorFromMessage(
  message: unknown,
): { chatId: string; revision: number } | null {
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
  const event = data as { chat_id?: unknown; revision?: unknown };
  if (typeof event.chat_id !== "string" || event.chat_id.length === 0) return null;
  if (typeof event.revision !== "number" || !Number.isFinite(event.revision)) return null;
  return { chatId: event.chat_id, revision: event.revision };
}

export class AgentChatCursorTracker {
  private readonly cursors = new Map<string, number>();

  noteSubscribe(chatId: string, afterSequence?: number | null): void {
    const next =
      typeof afterSequence === "number" && Number.isFinite(afterSequence) ? afterSequence : 0;
    const current = this.cursors.get(chatId) ?? 0;
    this.cursors.set(chatId, Math.max(current, next));
  }

  noteUnsubscribe(chatId: string): void {
    this.cursors.delete(chatId);
  }

  noteRevision(chatId: string, revision: number): void {
    if (!this.cursors.has(chatId)) return;
    const current = this.cursors.get(chatId) ?? 0;
    this.cursors.set(chatId, Math.max(current, revision));
  }

  snapshots(): AgentChatCursor[] {
    return [...this.cursors.entries()].map(([chat_id, after_sequence]) => ({
      chat_id,
      after_sequence,
    }));
  }
}
