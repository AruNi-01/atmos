// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
import type { AgentChatIndexEntry } from "@atmos/api-types/ws/dto/agent-chat";
import { formatLocalDateTime } from "@atmos/shared/utils/time";
import { historyPlaceLabel, historyTimeLabel, toChatListRows } from "./list-rows";

function entry(partial: Partial<AgentChatIndexEntry> & Pick<AgentChatIndexEntry, "id">): AgentChatIndexEntry {
  return {
    title: partial.title ?? null,
    cwd: "/repo",
    workspace_id: "ws",
    project_id: null,
    provider_id: partial.provider_id ?? "codex",
    updated_at: partial.updated_at ?? "2026-09-25T00:00:00Z",
    last_message_at: null,
    deleted: partial.deleted ?? false,
    ...partial,
  };
}

describe("toChatListRows", () => {
  test("hides deleted chats and replaces blank titles", () => {
    expect(toChatListRows([
      entry({ id: "blank", title: null, cwd: "/Users/me/.atmos/data/agent/scratch", provider_id: "codex", updated_at: "t1" }),
      entry({ id: "spaces", title: "   ", cwd: "/Users/me/OpenSource/atmos", provider_id: "grok", updated_at: "t2" }),
      entry({ id: "gone", title: "Keep", deleted: true, provider_id: "codex", updated_at: "t3" }),
      entry({ id: "named", title: "  Named chat  ", provider_id: "claude", updated_at: "t4" }),
    ])).toEqual([
      { id: "blank", title: "New chat", providerId: "codex", place: "Thread", updatedAt: "t1" },
      { id: "spaces", title: "New chat", providerId: "grok", place: ".../OpenSource/atmos", updatedAt: "t2" },
      { id: "named", title: "Named chat", providerId: "claude", place: "/repo", updatedAt: "t4" },
    ]);
  });

  test("history time matches the web month/day clock", () => {
    const value = "2026-09-18T02:33:00Z";
    expect(historyTimeLabel(value)).toBe(formatLocalDateTime(value, "MM/dd HH:mm"));
    expect(historyTimeLabel("  ")).toBeNull();
    expect(historyTimeLabel("not-a-date")).toBeNull();
    expect(historyPlaceLabel(null)).toBe("Thread");
  });
});
