// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
import {
  terminalActivityFromStatus,
  terminalActivityTitle,
  terminalAgentId,
  workspaceActivityRows,
} from "./workspace-activity";

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

  test("a newer terminal agent session sorts with chats", () => {
    const rows = workspaceActivityRows({
      chats: [
        { id: "chat", title: "Older chat", place: "Thread", updatedAt: "2026-09-01T00:00:00Z" },
      ],
      terminals: [{
        id: "pane",
        title: "claude",
        subtitle: "Terminal",
        updatedAt: "2026-09-25T00:00:00Z",
        catalogId: "ws:claude",
      }],
    });
    expect(rows.map((row) => row.id)).toEqual(["pane", "chat"]);
    expect(rows[0]?.catalogId).toBe("ws:claude");
  });

  test("terminal agent sessions come from status, not every open window", () => {
    const rows = terminalActivityFromStatus({
      workspaceId: "ws",
      snapshots: [
        {
          session_id: "ws:claude",
          surface: "terminal",
          context_id: "ws",
          tool: "claude-code",
          updated_at: "2026-09-22T00:00:00Z",
        },
        {
          session_id: "other:codex",
          surface: "terminal",
          context_id: "other",
          tool: "codex",
        },
      ],
      candidates: [
        { id: "shell", label: "zsh", tmux_window_name: "shell", cwd: "/repo/atmos" },
        {
          id: "tmux:ws:1",
          label: "1",
          tmux_window_name: "claude",
          session_title: "Fix the login",
          cwd: "/Users/aarynlu/OpenSource/atmos",
        },
      ],
      placeLabel: (cwd) => cwd ?? "Terminal",
    });

    expect(rows).toEqual([
      {
        id: "tmux:ws:1",
        catalogId: "ws:claude",
        title: "Fix the login",
        subtitle: "/Users/aarynlu/OpenSource/atmos",
        agentId: "claude-code",
        updatedAt: "2026-09-22T00:00:00Z",
      },
    ]);
  });

  test("terminal title prefers the session title", () => {
    expect(terminalActivityTitle({
      session_title: "Greeting",
      dynamic_title: "grok",
      label: "3",
    })).toBe("Greeting");
  });
});
