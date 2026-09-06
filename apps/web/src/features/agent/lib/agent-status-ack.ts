"use client";

import { useAgentAttentionStore } from "@/features/agent/store/agent-attention-store";

/** Occupancy / attention key for an Agent Chat surface. */
export function chatAttentionId(chatId: string | null | undefined): string | null {
  const id = chatId?.trim() ?? "";
  if (!id || id.startsWith("draft:")) return null;
  return `chat:${id}`;
}

/**
 * Chat analog of focusing a terminal pane. Marks the chat surface focused so
 * task-complete rings can clear; pending permission latches stay until the
 * agent resolves / cancels / ends the turn (server `agent_attention_cleared`).
 * Pointer enter / press on the live transcript surface should call this.
 */
export function ackAgentChatAttention(chatId: string | null | undefined): boolean {
  const id = chatAttentionId(chatId);
  if (!id) return false;
  useAgentAttentionStore.getState().notifyPaneFocused(id, { ack: "immediate" });
  return true;
}
