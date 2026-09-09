import { describe, expect, test } from "bun:test";
import type {
  ResourceProjectMetrics,
  ResourceSessionMetrics,
  ResourceUsage,
} from "@atmos/api-types/ws/dto/resource-monitor";
import { makeCenterSpaceKey } from "@/app-shell/center-space/center-space";
import type { AgentStatusRecord } from "@/features/agent/store/agent-status-store";
import type { AgentChatCenterTab } from "@/features/agent/store/use-agent-chat-center-tabs";
import type { Project } from "@/shared/types/domain";
import {
  canLocateResourceMonitorChatSession,
  collectResourceMonitorChatSessions,
  isResourceMonitorChatSession,
  mergeResourceMonitorChatSessions,
  resourceMonitorSessionUiKind,
} from "@/features/resource-monitor/lib/resource-monitor-agent-sessions";

const usage = (cpu: number, memory: number): ResourceUsage => ({
  cpu_percent: cpu,
  memory_rss_bytes: memory,
  process_count: 1,
});

const projects = [
  {
    id: "proj-1",
    name: "Atmos",
    workspaces: [
      {
        id: "ws-1",
        name: "butterfree",
        displayName: "butterfree",
        branch: "feat",
        projectId: "proj-1",
      },
    ],
  },
] as unknown as Project[];

function status(
  overrides: Partial<AgentStatusRecord> = {},
): AgentStatusRecord {
  return {
    session_id: "chat:chat-1",
    tool: "grok-build",
    state: "running",
    timestamp: "2026-09-09T00:00:00.000Z",
    context_id: "ws-1",
    surface: "chat",
    surface_id: "chat-1",
    space_id: "main",
    provider_id: "grok-build",
    ...overrides,
  };
}

function tab(
  overrides: Partial<AgentChatCenterTab> = {},
): AgentChatCenterTab {
  return {
    id: "agent-chat:chat-1",
    value: "agent-chat:chat-1",
    contextId: "ws-1",
    chatId: "chat-1",
    title: "Fix monitor",
    cwd: "/tmp",
    providerId: "grok-build",
    openedAt: 1,
    hasMessages: true,
    ...overrides,
  };
}

function snapshotProject(
  overrides: Partial<ResourceProjectMetrics> = {},
): ResourceProjectMetrics {
  return {
    project_id: "proj-1",
    name: "Atmos",
    usage: usage(4, 40),
    direct_usage: usage(1, 10),
    workspaces: [
      {
        workspace_id: "ws-1",
        name: "butterfree",
        usage: usage(2, 20),
        sessions: [
          {
            session_id: "sess-tui",
            name: "Grok Build",
            terminal_kind: "tmux",
            usage: usage(3, 30),
            processes: [],
          },
        ],
        other_usage: usage(0, 0),
        other_processes: [],
      },
    ],
    sessions: [],
    other_usage: usage(0, 0),
    other_processes: [],
    ...overrides,
  };
}

describe("collectResourceMonitorChatSessions", () => {
  test("places an agent-status chat under its workspace and prefers the open tab title", () => {
    const [chat] = collectResourceMonitorChatSessions({
      agentSessions: [status()],
      chatTabsByContext: { "ws-1": [tab()] },
      projects,
    });
    expect(chat).toMatchObject({
      sessionId: "chat:chat-1",
      chatId: "chat-1",
      name: "Fix monitor",
      projectId: "proj-1",
      workspaceId: "ws-1",
      spaceId: "main",
    });
    expect(chat?.toolbarAgent).toMatchObject({
      id: "grok-build",
      iconType: "built-in",
    });
  });

  test("includes an open chat tab that has no agent-status row yet", () => {
    const chats = collectResourceMonitorChatSessions({
      agentSessions: [],
      chatTabsByContext: { "ws-1": [tab()] },
      projects,
    });
    expect(chats).toHaveLength(1);
    expect(chats[0]?.agentStatus).toMatchObject({
      surface: "chat",
      surface_id: "chat-1",
      context_id: "ws-1",
    });
  });

  test("skips draft tabs and unknown hosts", () => {
    expect(
      collectResourceMonitorChatSessions({
        agentSessions: [status({ context_id: "missing" })],
        chatTabsByContext: {
          "ws-1": [tab({ chatId: null, title: "Draft" })],
          "other-host": [tab({ chatId: "chat-2", contextId: "other-host" })],
        },
        projects,
      }),
    ).toEqual([]);
  });

  test("reads space from the paint context key when status has none", () => {
    const paintId = makeCenterSpaceKey("ws-1", "space-review");
    const [chat] = collectResourceMonitorChatSessions({
      agentSessions: [],
      chatTabsByContext: {
        [paintId]: [
          tab({
            contextId: paintId,
            chatId: "chat-2",
            title: "Review chat",
          }),
        ],
      },
      projects,
    });
    expect(chat?.spaceId).toBe("space-review");
    expect(chat?.workspaceId).toBe("ws-1");
  });

  test("places a project-direct chat on the project, not a workspace", () => {
    const [chat] = collectResourceMonitorChatSessions({
      agentSessions: [status({ context_id: "proj-1", session_id: "chat:p1" })],
      chatTabsByContext: {},
      projects,
    });
    expect(chat?.projectId).toBe("proj-1");
    expect(chat?.workspaceId).toBeNull();
  });
});

describe("mergeResourceMonitorChatSessions", () => {
  test("appends a workspace chat beside the existing TUI session", () => {
    const chats = collectResourceMonitorChatSessions({
      agentSessions: [status()],
      chatTabsByContext: { "ws-1": [tab()] },
      projects,
    });
    const merged = mergeResourceMonitorChatSessions([snapshotProject()], chats);
    const sessions = merged[0]?.workspaces[0]?.sessions ?? [];
    expect(sessions.map((item) => item.session_id)).toEqual([
      "sess-tui",
      "chat:chat-1",
    ]);
    expect(isResourceMonitorChatSession(sessions[1] as ResourceSessionMetrics)).toBe(
      true,
    );
    expect(resourceMonitorSessionUiKind(sessions[0] as ResourceSessionMetrics)).toBe(
      "tui",
    );
  });

  test("injects a missing workspace when the snapshot has no row for it", () => {
    const chats = collectResourceMonitorChatSessions({
      agentSessions: [status()],
      chatTabsByContext: {},
      projects,
    });
    const merged = mergeResourceMonitorChatSessions(
      [
        snapshotProject({
          workspaces: [],
        }),
      ],
      chats,
    );
    expect(merged[0]?.workspaces).toHaveLength(1);
    expect(merged[0]?.workspaces[0]?.workspace_id).toBe("ws-1");
    expect(merged[0]?.workspaces[0]?.sessions[0]?.session_id).toBe("chat:chat-1");
  });

  test("does not duplicate a chat that is already in the tree", () => {
    const chats = collectResourceMonitorChatSessions({
      agentSessions: [status()],
      chatTabsByContext: {},
      projects,
    });
    const listed = {
      session_id: "chat:chat-1",
      name: "Fix monitor",
      terminal_kind: "chat",
      usage: usage(0, 0),
      processes: [],
    };
    const merged = mergeResourceMonitorChatSessions(
      [
        snapshotProject({
          workspaces: [
            {
              workspace_id: "ws-1",
              name: "butterfree",
              usage: usage(2, 20),
              sessions: [listed],
              other_usage: usage(0, 0),
              other_processes: [],
            },
          ],
        }),
      ],
      chats,
    );
    expect(merged[0]?.workspaces[0]?.sessions).toHaveLength(1);
  });

  test("keeps backend-attributed usage when overlaying Chat UI metadata", () => {
    const chats = collectResourceMonitorChatSessions({
      agentSessions: [status()],
      chatTabsByContext: { "ws-1": [tab()] },
      projects,
    });
    const backend = {
      session_id: "chat:chat-1",
      name: "Fix monitor",
      terminal_kind: "chat",
      usage: usage(6.2, 323),
      processes: [
        {
          name: "grok",
          usage: usage(6.2, 323),
          ports: [],
          leaked: false,
        },
      ],
    };
    const merged = mergeResourceMonitorChatSessions(
      [
        snapshotProject({
          workspaces: [
            {
              workspace_id: "ws-1",
              name: "butterfree",
              usage: usage(8, 343),
              sessions: [backend],
              other_usage: usage(0, 0),
              other_processes: [],
            },
          ],
        }),
      ],
      chats,
    );
    const session = merged[0]?.workspaces[0]?.sessions[0];
    expect(merged[0]?.workspaces[0]?.sessions).toHaveLength(1);
    expect(session?.usage).toEqual(usage(6.2, 323));
    expect(session?.processes).toHaveLength(1);
    expect(isResourceMonitorChatSession(session!)).toBe(true);
  });
});

describe("canLocateResourceMonitorChatSession", () => {
  test("requires a chat row with a host and chat id", () => {
    const chats = collectResourceMonitorChatSessions({
      agentSessions: [status()],
      chatTabsByContext: {},
      projects,
    });
    const merged = mergeResourceMonitorChatSessions([snapshotProject()], chats);
    const chat = merged[0]?.workspaces[0]?.sessions.find(
      (item) => item.session_id === "chat:chat-1",
    );
    expect(chat).toBeDefined();
    expect(canLocateResourceMonitorChatSession(chat!)).toBe(true);
    expect(
      canLocateResourceMonitorChatSession({
        session_id: "sess-tui",
        name: "Grok Build",
        terminal_kind: "tmux",
        usage: usage(1, 1),
        processes: [],
      }),
    ).toBe(false);
  });
});
