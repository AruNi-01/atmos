import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { AgentChatIndexEntry } from "@atmos/api-types/ws/dto/agent-chat";
import type { Project } from "@/shared/types/domain";
import {
  buildAgentChatHistoryHref,
  chatMatchesSessionScope,
  groupAgentChatSessionsByTime,
  resolveAgentChatLocationLabel,
  routeKindForAgentChatContext,
  sameStringSet,
} from "../agent-chat-sessions";

const ROOT = join(import.meta.dir, "../..");

function entry(
  overrides: Partial<AgentChatIndexEntry> = {},
): AgentChatIndexEntry {
  return {
    id: "chat-1",
    title: "Fix auth",
    cwd: "/tmp/app",
    workspace_id: "ws-1",
    project_id: "proj-1",
    provider_id: "claude",
    updated_at: "2026-08-30T12:00:00.000Z",
    last_message_at: null,
    deleted: false,
    ...overrides,
  };
}

const projects = [
  {
    id: "proj-1",
    name: "Atmos",
    workspaces: [{ id: "ws-1", name: "feat", displayName: "Feat chat" }],
  },
] as unknown as Project[];

describe("agent chat sessions helpers", () => {
  it("groups rows by recency", () => {
    const now = new Date("2026-08-30T12:00:00.000Z");
    const grouped = groupAgentChatSessionsByTime(
      [
        entry({ id: "today", updated_at: "2026-08-30T08:00:00.000Z" }),
        entry({ id: "yesterday", updated_at: "2026-08-29T12:00:00.000Z" }),
        entry({ id: "week", updated_at: "2026-08-24T12:00:00.000Z" }),
        entry({ id: "missing", updated_at: null }),
      ],
      now,
    );
    expect(grouped.today.map((row) => row.id)).toEqual(["today"]);
    expect(grouped.yesterday.map((row) => row.id)).toEqual(["yesterday"]);
    expect(grouped.daysAgo2To6.map((row) => row.id)).toEqual(["week"]);
    expect(grouped.older.map((row) => row.id)).toEqual(["missing"]);
  });

  it("keeps all chats until a project scope is selected", () => {
    const workspaceChat = entry();
    const other = entry({
      id: "chat-2",
      workspace_id: "ws-2",
      cwd: "/tmp/other",
    });
    expect(
      chatMatchesSessionScope(workspaceChat, {
        roots: null,
        selectedProjectId: null,
        selectedWorkspaceIds: [],
      }),
    ).toBe(true);
    expect(
      chatMatchesSessionScope(other, {
        roots: ["/tmp/app", "/tmp/workspace"],
        selectedProjectId: "proj-1",
        selectedWorkspaceIds: ["ws-1"],
      }),
    ).toBe(false);
    expect(
      chatMatchesSessionScope(workspaceChat, {
        roots: ["/tmp/app"],
        selectedProjectId: "proj-1",
        selectedWorkspaceIds: ["ws-1"],
      }),
    ).toBe(true);
  });

  it("limits the thread scope to scratch chats with no project or workspace", () => {
    const threadChat = entry({
      id: "thread-1",
      workspace_id: null,
      project_id: null,
      cwd: "/tmp/scratch",
    });
    expect(
      chatMatchesSessionScope(threadChat, {
        roots: null,
        selectedProjectId: null,
        selectedWorkspaceIds: [],
        threadOnly: true,
      }),
    ).toBe(true);
    expect(
      chatMatchesSessionScope(entry(), {
        roots: null,
        selectedProjectId: null,
        selectedWorkspaceIds: [],
        threadOnly: true,
      }),
    ).toBe(false);
  });

  it("labels thread, project, and workspace locations without exposing paths", () => {
    expect(
      resolveAgentChatLocationLabel(
        entry({ workspace_id: null, project_id: "proj-1" }),
        projects,
        "Thread",
      ),
    ).toEqual({ kind: "project", label: "Atmos" });
    expect(resolveAgentChatLocationLabel(entry(), projects, "Thread")).toEqual({
      kind: "workspace",
      label: "Atmos - Feat chat",
    });
    expect(
      resolveAgentChatLocationLabel(
        entry({
          workspace_id: null,
          project_id: null,
          cwd: "/Users/me/.atmos/data/agent/scratch",
        }),
        projects,
        "Thread",
      ),
    ).toEqual({ kind: "thread", label: "Thread" });
  });

  it("opens workspace chats on the owning host and scratch chats standalone", () => {
    expect(buildAgentChatHistoryHref(entry(), projects)).toBe(
      "/workspace?id=ws-1&tab=agent-chat%3Achat-1",
    );
    expect(
      buildAgentChatHistoryHref(
        entry({ workspace_id: null, project_id: "proj-1" }),
        projects,
      ),
    ).toBe("/project?id=proj-1&tab=agent-chat%3Achat-1");
    expect(
      buildAgentChatHistoryHref(
        entry({ workspace_id: null, project_id: null }),
        projects,
      ),
    ).toBe("/agent-chat?chatId=chat-1");
    expect(routeKindForAgentChatContext("proj-1", projects)).toBe("project");
    expect(sameStringSet(["a", "b"], ["b", "a"])).toBe(true);
  });
});

describe("agents sessions page uses Atmos chat history", () => {
  it("lists Atmos chats from agent_chat_list instead of the moved placeholder", () => {
    const manager = readFileSync(join(ROOT, "components/AgentManagerView.tsx"), "utf8");
    expect(manager).toContain("<AgentChatSessionsView hideHeader />");
    expect(manager).not.toContain("sessionsMoved");

    const view = readFileSync(
      join(ROOT, "components/AgentChatSessionsView.tsx"),
      "utf8",
    );
    expect(view).toContain("agentChatApi.list");
    expect(view).toContain("all: true");
    expect(view).toContain("openAgentChatHistoryRow");
    expect(view).toContain("THREAD_SESSION_CONTEXT_ID");
    expect(view).toContain("sessionContext.thread");
    expect(view).toContain("sessionCard.quickChat");
    expect(view).toContain("sessionCard.normalChat");
    expect(view).toContain("resolveAgentChatLocationLabel");
    expect(view).toContain("GitBranch");
    expect(view).toContain("MessagesSquare");
    expect(view).not.toContain("acp_session_id");
    expect(view).not.toContain("useAcpSessionList");
  });
});
