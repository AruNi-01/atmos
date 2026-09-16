import type { AttentionReason } from "@/features/agent/store/agent-attention-store";
import { chatAttentionLookupIds } from "@/features/agent/lib/agent-status-ack";
import { resolveRolledAttentionReason } from "@/features/agent/lib/workspace-agent-status";

/**
 * Sticky attention for an Agent Chat tab. Same lookup as the center-tab
 * status indicator (`chat:{id}` plus the raw id; permission beats complete).
 */
export function resolveAgentChatAttentionReason(
  chatId: string | null | undefined,
  panes: ReadonlyMap<string, { reason?: AttentionReason | null }>,
): AttentionReason | null {
  return resolveRolledAttentionReason(
    chatAttentionLookupIds(chatId).map((id) => panes.get(id)?.reason ?? null),
  );
}

/**
 * Whether a Chat tab should confirm close. Matches the tab chrome: live
 * occupancy that is not idle, or sticky Need attention / Need permission.
 * Drafts and empty ids are idle.
 */
export function shouldConfirmCloseAgentChat(input: {
  chatId: string | null | undefined;
  occupancy: string | null | undefined;
  attentionReason: AttentionReason | null;
}): boolean {
  const id = input.chatId?.trim() ?? "";
  if (!id || id.startsWith("draft:")) return false;
  const occupancy = input.occupancy?.trim() || "idle";
  return occupancy !== "idle" || input.attentionReason != null;
}
