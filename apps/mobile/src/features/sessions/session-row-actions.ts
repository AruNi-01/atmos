export type SessionDeleteChoice = "both" | "chat" | "native";

export function sessionDeleteFlags(choice: SessionDeleteChoice): {
  include_atmos_chat: boolean;
  include_source: boolean;
} {
  return {
    include_atmos_chat: choice === "both" || choice === "chat",
    include_source: choice === "both" || choice === "native",
  };
}

export function parseSidebarIdList(settings: unknown, key: string): string[] {
  if (!settings || typeof settings !== "object") return [];
  const sidebar = (settings as { workspace_sidebar?: Record<string, unknown> }).workspace_sidebar;
  const value = sidebar?.[key];
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.length > 0);
}

export function parsePinnedSessionIds(settings: unknown): string[] {
  return parseSidebarIdList(settings, "pinned_session_ids");
}

export function parseArchivedSessionIds(settings: unknown): string[] {
  return parseSidebarIdList(settings, "archived_session_ids");
}

/** Partial host-session deletes still return success. Surface that instead of hiding the chat. */
export function deletionFailureMessage(failures: readonly string[]): string | null {
  const messages = failures.map((item) => item.trim()).filter((item) => item.length > 0);
  return messages.length > 0 ? messages.join("; ") : null;
}
