import { agentChatApi } from "@/api/ws/agent-chat-api";
import { hostSessionApi } from "@/api/ws/host-session-api";
import type { SidebarSessionRow } from "@/app-shell/sidebar/session-grouping";

export type SessionDeleteOptions = {
  includeAtmosChat: boolean;
  includeSource: boolean;
};

/** Atmos chat id for a sidebar chat row. Terminal rows and drafts have none. */
export function sidebarChatId(row: SidebarSessionRow): string | null {
  if (row.surface !== "chat" || row.draftTab) return null;
  const surfaceId = row.surfaceId?.trim();
  if (surfaceId) return surfaceId;
  if (row.sessionId.startsWith("chat:")) {
    const id = row.sessionId.slice("chat:".length).trim();
    return id || null;
  }
  return null;
}

export async function archiveLinkedHostSessions(chatId: string): Promise<void> {
  const { keys } = await hostSessionApi.keysForChat(chatId);
  if (keys.length === 0) return;
  await hostSessionApi.setArchived(keys, true);
}

export async function deleteLinkedHostSessions(
  chatId: string,
  options: SessionDeleteOptions,
): Promise<void> {
  const { keys } = await hostSessionApi.keysForChat(chatId);
  if (keys.length > 0) {
    await hostSessionApi.deleteSessions({
      keys,
      include_atmos_chat: options.includeAtmosChat,
      include_source: options.includeSource,
    });
    return;
  }
  if (options.includeAtmosChat) {
    await agentChatApi.delete(chatId);
  }
}
