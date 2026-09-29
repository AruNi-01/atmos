import { describe, expect, test } from "bun:test";
import type { AgentChatCenterTab } from "@/features/agent/store/use-agent-chat-center-tabs";
import { draftPromptTitle } from "@/features/agent/store/use-agent-chat-center-tabs";
import type { Project, Workspace } from "@/shared/types/domain";

import { newChatDraftSessionRows } from "./new-chat-draft-sessions";

function workspace(): Workspace {
  return {
    id: "workspace-1",
    name: "Feature",
    branch: "feat",
    baseBranch: "main",
    isActive: false,
    status: "clean",
    projectId: "project-1",
    isPinned: false,
    isArchived: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    workflowStatus: "in_progress",
    priority: "no_priority",
    labels: [],
    localPath: "/tmp/atmos/feature",
    createSource: "manual",
  };
}

function project(): Project {
  return {
    id: "project-1",
    name: "Atmos",
    isOpen: true,
    workspaces: [workspace()],
    mainFilePath: "/tmp/atmos",
    sidebarOrder: 0,
    borderColor: null,
    logoPath: null,
  };
}

function tab(overrides: Partial<AgentChatCenterTab> = {}): AgentChatCenterTab {
  return {
    id: "agent-chat:draft:1",
    value: "agent-chat:draft:1",
    contextId: "workspace-1",
    chatId: null,
    title: "Chat",
    idleTitle: "Chat",
    draftPrompt: "",
    cwd: "",
    providerId: null,
    openedAt: Date.parse("2026-09-27T00:00:00.000Z"),
    hasMessages: false,
    ...overrides,
  };
}

describe("new chat draft sessions", () => {
  test("an empty new chat tab is not a session", () => {
    expect(newChatDraftSessionRows({
      projects: [project()],
      tabsByContext: { "workspace-1": [tab()] },
    })).toEqual([]);
  });

  test("unsent text becomes a truncated session row", () => {
    const prompt = `  hello\nworld ${"x".repeat(80)}`;
    const rows = newChatDraftSessionRows({
      projects: [project()],
      tabsByContext: {
        "workspace-1": [tab({ draftPrompt: prompt })],
      },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.title).toBe(draftPromptTitle(prompt));
    expect(rows[0]?.title.endsWith("…")).toBe(true);
    expect(rows[0]?.draftTab).toEqual({
      contextId: "workspace-1",
      value: "agent-chat:draft:1",
    });
    expect(rows[0]?.workspaceName).toBe("Feature");
  });

  test("a created chat is not listed as a draft", () => {
    expect(newChatDraftSessionRows({
      projects: [project()],
      tabsByContext: {
        "workspace-1": [tab({ chatId: "conv-1", draftPrompt: "already sent" })],
      },
    })).toEqual([]);
  });
});
