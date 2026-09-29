// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
import { terminalActivityTitle, terminalAgentId, workspaceActivityRows } from "./workspace-activity";

describe("workspace activity list", () => {
  test("keeps chats and terminals in one list, newest chats first", () => {
    const rows = workspaceActivityRows({
      chats: [
        { id: "old", title: "Older chat", place: "Thread", updatedAt: "2026-09-01T00:00:00Z" },
        { id: "new", title: "Newer chat", place: "Thread", updatedAt: "2026-09-25T00:00:00Z" },
      ],
      terminals: [{ id: "pane", title: "shell", subtitle: "Terminal" }],
    });
    expect(rows.map((row) => row.id)).toEqual(["new", "old", "pane"]);
    expect(rows.map((row) => row.kind)).toEqual(["chat", "chat", "terminal"]);
  });

  test("matches a terminal to the agent reported by its session", () => {
    expect(terminalAgentId(
      "ws",
      { id: "pane", session_id: null, tmux_window_name: "codex" },
      [{ session_id: "ws:codex", tool: "codex" }],
    )).toBe("codex");
  });

  test("terminal title prefers the session title", () => {
    expect(terminalActivityTitle({
      session_title: "Greeting",
      dynamic_title: "grok",
      label: "3",
    })).toBe("Greeting");
  });
});
