// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
import {
  buildSessionInbox,
  filterSessionRows,
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

  test("recent list is the five newest panes", () => {
    const times = [
      "2026-09-22T00:00:00Z",
      "2026-09-22T01:00:00Z",
      "2026-09-22T02:00:00Z",
      "2026-09-22T03:00:00Z",
      "2026-09-22T04:00:00Z",
      "2026-09-22T05:00:00Z",
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

    expect(inbox.recent).toHaveLength(5);
    expect(inbox.recent.map((row) => row.updatedAt)).toEqual([...times].reverse().slice(0, 5));
    for (let index = 1; index < inbox.recent.length; index += 1) {
      expect(Date.parse(inbox.recent[index - 1]!.updatedAt!)).toBeGreaterThan(
        Date.parse(inbox.recent[index]!.updatedAt!),
      );
    }
  });

  test("null time is done and absent from recent", () => {
    const inbox = buildSessionInbox({
      candidates: [candidate({ id: "never", workspaceId: "ws", label: "Never", tmuxWindowName: "never" })],
      snapshots: [],
    });

    expect(inbox.rows[0]).toMatchObject({ id: "never", bucket: "done", updatedAt: null });
    expect(inbox.recent.map((row) => row.id)).not.toContain("never");
    expect(inbox.cards.find((card) => card.bucket === "done")?.count).toBe(1);
  });

  test("two candidates in one workspace stay two rows", () => {
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
      snapshots: [],
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
      snapshots: [],
    });

    expect(inbox.rows.map((row) => row.title)).toEqual(["Greeting and asking who Grok is"]);
  });

  test("drops a chat snapshot and keeps a side-chat terminal", () => {
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
        }),
        snapshot({
          session_id: "ws:side-chat",
          group_key: "running",
        }),
      ],
    });

    expect(inbox.rows.map((row) => row.title)).toEqual(["Side chat"]);
    expect(inbox.rows.some((row) => row.id.startsWith("chat:") || row.title.startsWith("chat:"))).toBe(false);
    expect(inbox.rows[0]?.bucket).toBe("running");
  });

  test("keeps a terminal snapshot when its candidate is gone", () => {
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
    });

    expect(inbox.rows).toEqual([
      expect.objectContaining({
        title: "ws:gone",
        bucket: "done",
        updatedAt: "2026-09-22T03:00:00Z",
        projectName: "Atmos",
        workspaceName: "api",
        terminalCandidateId: null,
        projectScoped: false,
      }),
    ]);
    expect(inbox.recent.map((row) => row.title)).toEqual(["ws:gone"]);
  });

  test("project-scoped snapshot omits the workspace name", () => {
    const inbox = buildSessionInbox({
      candidates: [],
      snapshots: [
        snapshot({
          session_id: "proj:pane",
          group_key: "done",
          context_id: "proj",
        }),
      ],
      projects: [{ id: "proj", name: "Atmos" }],
    });

    expect(inbox.rows[0]).toMatchObject({
      projectScoped: true,
      projectName: "Atmos",
      workspaceName: null,
      workspaceId: null,
    });
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
});
