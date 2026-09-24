// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
import type { SessionInboxRow } from "./session-inbox";
import { rowsForTerminalEntries, rowsInScope } from "./scoped-session-rows";

function row(partial: Partial<SessionInboxRow> & Pick<SessionInboxRow, "id">): SessionInboxRow {
  return {
    archiveSessionId: null,
    branch: null,
    bucket: "running",
    prState: null,
    projectName: "Atmos",
    projectScoped: false,
    terminalCandidateId: partial.id,
    title: partial.id,
    updatedAt: null,
    workspaceId: "ws",
    workspaceName: "mobile",
    ...partial,
  };
}

describe("scoped session rows", () => {
  test("keeps sessions for the open workspace", () => {
    const rows = [
      row({ id: "here", workspaceId: "ws" }),
      row({ id: "elsewhere", workspaceId: "other" }),
      row({ id: "project", projectName: "Atmos", projectScoped: true, workspaceId: null, workspaceName: null }),
    ];

    expect(rowsInScope(rows, new Set(["ws"])).map((item) => item.id)).toEqual(["here"]);
    expect(rowsInScope(rows, new Set(["missing"]), "Atmos").map((item) => item.id)).toEqual(["project"]);
  });

  test("uses the terminal title and keeps session status", () => {
    const [next] = rowsForTerminalEntries(
      [{ id: "pane", workspaceId: "ws", label: "3" }],
      [row({ id: "pane", title: "3", updatedAt: "2026-09-25T00:00:00Z" })],
      () => "Greeting and asking who Grok is",
    );

    expect(next?.title).toBe("Greeting and asking who Grok is");
    expect(next?.bucket).toBe("running");
    expect(next?.projectName).toBeNull();
    expect(next?.terminalCandidateId).toBe("pane");
  });
});
