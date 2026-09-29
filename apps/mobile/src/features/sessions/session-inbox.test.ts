// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
import {
  buildSessionInbox,
  filterSessionRows,
  orderPinnedRows,
  type SessionInboxCandidate,
  type SessionInboxSnapshot,
} from "./session-inbox";

function candidate(
  partial: Partial<SessionInboxCandidate> & Pick<SessionInboxCandidate, "id" | "workspaceId">,
): SessionInboxCandidate {
  return {
    label: partial.label ?? partial.id,
    ...partial,
  };
}

function snapshot(
  partial: Partial<SessionInboxSnapshot> & Pick<SessionInboxSnapshot, "session_id" | "group_key">,
): SessionInboxSnapshot {
  return {
    surface: "terminal",
    updated_at: "2026-09-22T00:00:00Z",
    context_id: "ws",
    ...partial,
  };
}

describe("session inbox", () => {
  test("card order and counts", () => {
    const panes = [
      ["permission", "perm"],
      ["attention", "attn"],
      ["running", "run"],
      ["done", "done"],
    ] as const;
    const inbox = buildSessionInbox({
      candidates: panes.map(([, windowName]) =>
        candidate({
          id: windowName,
          workspaceId: "ws",
          label: windowName,
          tmuxWindowName: windowName,
        }),
      ),
      snapshots: panes.map(([bucket, windowName]) =>
        snapshot({
          session_id: `ws:${windowName}`,
          group_key: bucket,
        }),
      ),
    });

    expect(inbox.cards.map((card) => card.bucket)).toEqual([
      "permission",
      "attention",
      "running",
      "done",
    ]);
    expect(inbox.cards.map((card) => card.label)).toEqual([
      "Need permission",
      "Need attention",
      "Running",
      "Done",
    ]);
    expect(inbox.cards.map((card) => card.count)).toEqual([1, 1, 1, 1]);
  });

  test("empty inbox is four zero counts", () => {
    const inbox = buildSessionInbox({ candidates: [], snapshots: [] });
    expect(inbox.cards.map((card) => card.count)).toEqual([0, 0, 0, 0]);
    expect(inbox.recent).toEqual([]);
  });

  test("bucket filter returns only that key", () => {
    const inbox = buildSessionInbox({
      candidates: [
        candidate({ id: "perm", workspaceId: "ws", tmuxWindowName: "perm" }),
        candidate({ id: "run", workspaceId: "ws", tmuxWindowName: "run" }),
      ],
      snapshots: [
        snapshot({ session_id: "ws:perm", group_key: "permission" }),
        snapshot({ session_id: "ws:run", group_key: "running" }),
      ],
    });
    const permission = filterSessionRows(inbox.rows, "permission");
    expect(permission.map((row) => row.id)).toEqual(["perm"]);
    expect(permission.every((row) => row.bucket === "permission")).toBe(true);
  });

  test("recent list is the eight newest panes", () => {
    const times = [
      "2026-09-22T00:00:00Z",
      "2026-09-22T01:00:00Z",
      "2026-09-22T02:00:00Z",
      "2026-09-22T03:00:00Z",
      "2026-09-22T04:00:00Z",
      "2026-09-22T05:00:00Z",
      "2026-09-22T06:00:00Z",
      "2026-09-22T07:00:00Z",
      "2026-09-22T08:00:00Z",
    ];
    const inbox = buildSessionInbox({
      candidates: times.map((time, index) =>
        candidate({
          id: `pane-${index}`,
          workspaceId: "ws",
          tmuxWindowName: `win-${index}`,
        }),
      ),
      snapshots: times.map((time, index) =>
        snapshot({
          session_id: `ws:win-${index}`,
          group_key: "running",
          updated_at: time,
        }),
      ),
    });

    expect(inbox.recent).toHaveLength(8);
    expect(inbox.recent.map((row) => row.updatedAt)).toEqual([...times].reverse().slice(0, 8));
    for (let index = 1; index < inbox.recent.length; index += 1) {
      expect(Date.parse(inbox.recent[index - 1]!.updatedAt!)).toBeGreaterThan(
        Date.parse(inbox.recent[index]!.updatedAt!),
      );
    }
  });

  test("a shell that never became an agent session is omitted", () => {
    const inbox = buildSessionInbox({
      candidates: [candidate({ id: "never", workspaceId: "ws", label: "Never", tmuxWindowName: "never" })],
      snapshots: [],
    });

    expect(inbox.rows).toEqual([]);
    expect(inbox.recent).toEqual([]);
    expect(inbox.cards.find((card) => card.bucket === "done")?.count).toBe(0);
  });

  test("two open agent windows in one workspace stay two rows", () => {
    const inbox = buildSessionInbox({
      candidates: [
        candidate({
          id: "one",
          workspaceId: "ws",
          label: "Editor",
          tmuxWindowName: "editor",
          projectName: "Atmos",
          workspaceName: "api",
          branch: "main",
        }),
        candidate({
          id: "two",
          workspaceId: "ws",
          label: "Shell",
          tmuxWindowName: "shell",
          projectName: "Atmos",
          workspaceName: "api",
          branch: "main",
        }),
      ],
      snapshots: [
        snapshot({ session_id: "ws:editor", group_key: "done" }),
        snapshot({ session_id: "ws:shell", group_key: "running" }),
      ],
    });

    expect(inbox.rows).toHaveLength(2);
    expect(inbox.rows.map((row) => row.title).sort()).toEqual(["Editor", "Shell"]);
    expect(inbox.rows.every((row) => row.projectName === "Atmos" && row.workspaceName === "api" && row.branch === "main")).toBe(true);
  });

  test("uses the server session title instead of a tmux index", () => {
    const inbox = buildSessionInbox({
      candidates: [
        candidate({
          id: "tmux:ws:3",
          workspaceId: "ws",
          label: "3",
          tmuxWindowName: "3",
          sessionTitle: "Greeting and asking who Grok is",
          dynamicTitle: "grok",
        }),
      ],
      snapshots: [snapshot({ session_id: "ws:3", group_key: "done" })],
    });

    expect(inbox.rows.map((row) => row.title)).toEqual(["Greeting and asking who Grok is"]);
  });

  test("keeps a chat snapshot and drops a non-chat non-terminal snapshot", () => {
    const inbox = buildSessionInbox({
      candidates: [
        candidate({
          id: "side",
          workspaceId: "ws",
          label: "Side chat",
          tmuxWindowName: "side-chat",
          sessionId: "ws:side-chat",
        }),
      ],
      snapshots: [
        snapshot({
          session_id: "chat:abc",
          surface: "chat",
          group_key: "running",
          context_id: "ws",
          tool: "claude-code",
        }),
        snapshot({
          session_id: "ws:side-chat",
          group_key: "running",
        }),
        snapshot({
          session_id: "preview:1",
          surface: "preview",
          group_key: "attention",
        }),
      ],
      workspaces: [{ id: "ws", projectName: "Atmos", workspaceName: "api", branch: "main" }],
      chatTitles: { abc: "Fix login" },
    });

    expect(inbox.rows.find((row) => row.id === "chat:abc")).toMatchObject({
      agentId: "claude-code",
      archiveSessionId: "chat:abc",
      bucket: "running",
      chatId: "abc",
      kind: "chat",
      terminalCandidateId: null,
      title: "Fix login",
      workspaceId: "ws",
    });
    expect(inbox.rows.find((row) => row.id === "side")).toMatchObject({
      bucket: "running",
      title: "Side chat",
    });
    expect(inbox.rows.some((row) => row.id === "preview:1" || row.archiveSessionId === "preview:1")).toBe(false);
  });

  test("a chat without a loaded title stays blank instead of Chat", () => {
    const inbox = buildSessionInbox({
      candidates: [],
      snapshots: [
        snapshot({
          session_id: "chat:abc",
          surface: "chat",
          group_key: "done",
          context_id: "ws",
        }),
      ],
      workspaces: [{ id: "ws", projectName: "Atmos", workspaceName: "api", branch: "main" }],
      chatTitlesPending: true,
    });

    expect(inbox.rows.find((row) => row.id === "chat:abc")).toMatchObject({
      title: "",
      titlePending: true,
    });
  });

  test("drops a terminal whose window is already gone", () => {
    const inbox = buildSessionInbox({
      candidates: [],
      snapshots: [
        snapshot({
          session_id: "ws:gone",
          group_key: "done",
          updated_at: "2026-09-22T03:00:00Z",
          context_id: "ws",
        }),
      ],
      workspaces: [{ id: "ws", projectName: "Atmos", workspaceName: "api", branch: "main" }],
      chatTitles: { abc: "Fix login" },
    });

    expect(inbox.rows).toEqual([]);
    expect(inbox.recent).toEqual([]);
  });

  test("keeps a terminal while its workspace candidates are still loading", () => {
    const inbox = buildSessionInbox({
      candidates: [],
      snapshots: [
        snapshot({
          session_id: "ws:open",
          group_key: "running",
          context_id: "ws",
        }),
      ],
      workspaces: [{ id: "ws", projectName: "Atmos", workspaceName: "api", branch: "main" }],
      pendingWorkspaceIds: ["ws"],
    });

    expect(inbox.rows).toEqual([
      expect.objectContaining({
        id: "ws:open",
        bucket: "running",
        workspaceId: "ws",
        terminalCandidateId: null,
      }),
    ]);
  });

  test("omits a snapshot whose workspace is archived", () => {
    const inbox = buildSessionInbox({
      candidates: [],
      snapshots: [
        snapshot({
          session_id: "old:1",
          group_key: "done",
          context_id: "archived-ws",
        }),
      ],
      archivedWorkspaceIds: ["archived-ws"],
    });

    expect(inbox.rows).toHaveLength(0);
  });

  test("pinned ids stay in saved order ahead of the rest", () => {
    const rows = [{ id: "a" }, { id: "b" }, { id: "c" }];
    expect(orderPinnedRows(rows, ["c", "a", "missing"], (row) => row.id).map((row) => row.id)).toEqual([
      "c",
      "a",
      "b",
    ]);
  });
});
