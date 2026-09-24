"use client";

import { useAgentAttentionStore } from "@/features/agent/store/agent-attention-store";

/** Occupancy / attention key for an Agent Chat surface. */
export function chatAttentionId(chatId: string | null | undefined): string | null {
  const id = chatId?.trim() ?? "";
  if (!id || id.startsWith("draft:")) return null;
  return `chat:${id}`;
}

/** Latch keys to probe for a Chat tab (`chat:{id}` plus the raw id). */
export function chatAttentionLookupIds(chatId: string | null | undefined): string[] {
  const prefixed = chatAttentionId(chatId);
  if (!prefixed) return [];
  const raw = chatId?.trim() ?? "";
  return raw && raw !== prefixed ? [prefixed, raw] : [prefixed];
}

/**
 * Chat analog of focusing a terminal pane. Marks the chat surface focused so
 * task-complete can clear after the same short dwell as a terminal jump.
 * Does not drop the idle session: selecting a message is not "this agent is
 * gone", and removing it makes the footer flash Napping until the server
 * sends the same completed row back.
 */
export function ackAgentChatAttention(chatId: string | null | undefined): boolean {
  const id = chatAttentionId(chatId);
  if (!id) return false;
  useAgentAttentionStore.getState().notifyPaneFocused(id, {
    ack: "deferred",
    dismissIdle: false,
  });
  return true;
}
