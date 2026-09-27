import type { AgentChatIndexEntry } from "@atmos/api-types/ws/dto/agent-chat";
import { formatLocalDateTime } from "@atmos/shared/utils/time";
import { copy } from "./copy";

export type ChatListRow = {
  id: string;
  title: string;
  providerId: string;
  place: string;
  updatedAt: string;
};

function rowTitle(title: string | null): string {
  const trimmed = title?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : copy.newChat;
}

const SCRATCH_CWD = /(?:^|[/\\])\.atmos[/\\]data[/\\]agent[/\\]scratch$/i;

export function historyPlaceLabel(cwd: string | null | undefined): string {
  const trimmed = cwd?.trim() ?? "";
  const normalized = trimmed.replace(/\\/g, "/").replace(/\/+$/, "");
  if (!normalized || SCRATCH_CWD.test(normalized)) return "Thread";
  const parts = normalized.split("/").filter(Boolean);
  if (parts.length <= 2) return normalized;
  return `.../${parts.slice(-2).join("/")}`;
}

export function historyTimeLabel(updatedAt: string | null | undefined): string | null {
  const value = updatedAt?.trim() ?? "";
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return formatLocalDateTime(value, "MM/dd HH:mm");
}

export function toChatListRows(items: AgentChatIndexEntry[]): ChatListRow[] {
  const rows: ChatListRow[] = [];
  for (const item of items) {
    if (item.deleted) continue;
    rows.push({
      id: item.id,
      title: rowTitle(item.title),
      providerId: item.provider_id,
      place: historyPlaceLabel(item.cwd),
      updatedAt: item.updated_at,
    });
  }
  return rows;
}
