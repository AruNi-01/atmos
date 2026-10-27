// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
import {
  filterSessionRowsByAgent,
  SESSION_AGENT_FILTER_EMPTY,
  SESSION_AGENT_NONE,
  sessionAgentChoices,
  sessionAgentId,
  sessionAgentLabel,
  visibleSessionInbox,
} from "./session-agent-filter";
import { sessionInboxCards, type SessionInboxRow } from "./session-inbox";

function row(
  partial: Pick<SessionInboxRow, "id" | "agentId"> & Partial<SessionInboxRow>,
): SessionInboxRow {
  return {
    additions: 0,
    archiveSessionId: partial.id,
    branch: null,
    bucket: "done",
    chatId: null,
    deletions: 0,
    kind: "chat",
    prState: null,
    projectId: null,
    projectName: "Atmos",
    projectScoped: false,
    terminalCandidateId: null,
    title: partial.id,
    updatedAt: "2026-09-22T00:00:00Z",
    workspaceId: "ws",
    workspaceName: "api",
    ...partial,
  };
}

describe("session agent filter", () => {
  test("blank tool is the unknown agent id", () => {
    expect(sessionAgentId({ agentId: null })).toBe(SESSION_AGENT_NONE);
    expect(sessionAgentId({ agentId: "  " })).toBe(SESSION_AGENT_NONE);
    expect(sessionAgentId({ agentId: "codex" })).toBe("codex");
  });

  test("labels pretty-print ids and keep Unknown last", () => {
    expect(sessionAgentLabel("claude-code")).toBe("Claude Code");
    expect(sessionAgentLabel(SESSION_AGENT_NONE)).toBe("Unknown");
    expect(
      sessionAgentChoices([
        row({ id: "u", agentId: null }),
        row({ id: "g", agentId: "grok-build" }),
        row({ id: "c", agentId: "codex" }),
      ]).map((choice) => choice.id),
    ).toEqual(["codex", "grok-build", SESSION_AGENT_NONE]);
  });

  test("keeps a selected agent that is not in the current rows", () => {
    expect(
      sessionAgentChoices([row({ id: "c", agentId: "codex" })], ["claude-code"]).map(
        (choice) => choice.id,
      ),
    ).toEqual(["claude-code", "codex"]);
  });

  test("empty selection is every row", () => {
    const rows = [
      row({ id: "codex", agentId: "codex", bucket: "running" }),
      row({ id: "claude", agentId: "claude-code", bucket: "done" }),
    ];
    expect(filterSessionRowsByAgent(rows, []).map((item) => item.id)).toEqual(["codex", "claude"]);
  });

  test("selected agents narrow the list, including unknown", () => {
    const rows = [
      row({ id: "codex", agentId: "codex", bucket: "running" }),
      row({ id: "claude", agentId: "claude-code", bucket: "done" }),
      row({ id: "bare", agentId: null, bucket: "attention" }),
    ];
    expect(filterSessionRowsByAgent(rows, ["codex"]).map((item) => item.id)).toEqual(["codex"]);
    expect(filterSessionRowsByAgent(rows, [SESSION_AGENT_NONE]).map((item) => item.id)).toEqual([
      "bare",
    ]);
    expect(filterSessionRowsByAgent(rows, ["codex", "claude-code"]).map((item) => item.id)).toEqual(
      ["codex", "claude"],
    );
  });

  test("an active filter recomputes cards and recent from the matching rows", () => {
    const rows = [
      row({
        id: "old-codex",
        agentId: "codex",
        bucket: "done",
        updatedAt: "2026-09-22T01:00:00Z",
      }),
      row({
        id: "new-claude",
        agentId: "claude-code",
        bucket: "running",
        updatedAt: "2026-09-22T03:00:00Z",
      }),
      row({
        id: "newer-codex",
        agentId: "codex",
        bucket: "running",
        updatedAt: "2026-09-22T04:00:00Z",
      }),
    ];
    const unfiltered = visibleSessionInbox({
      agentIds: [],
      cards: sessionInboxCards(rows),
      recent: rows,
      rows,
    });
    expect(unfiltered.filterActive).toBe(false);
    expect(unfiltered.cards.find((card) => card.bucket === "running")?.count).toBe(2);

    const filtered = visibleSessionInbox({
      agentIds: ["codex"],
      cards: unfiltered.cards,
      recent: rows,
      rows,
    });
    expect(filtered.filterActive).toBe(true);
    expect(filtered.rows.map((item) => item.id)).toEqual(["old-codex", "newer-codex"]);
    expect(filtered.cards.find((card) => card.bucket === "running")?.count).toBe(1);
    expect(filtered.cards.find((card) => card.bucket === "done")?.count).toBe(1);
    expect(filtered.recent.map((item) => item.id)).toEqual(["newer-codex", "old-codex"]);
    expect(SESSION_AGENT_FILTER_EMPTY.title).toBe("No matching sessions");
  });
});
