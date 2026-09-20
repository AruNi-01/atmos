import type { TerminalTitleAgent } from "@atmos/shared/terminal";
import type {
  ResourceProjectMetrics,
  ResourceSessionMetrics,
  ResourceWorkspaceMetrics,
} from "@atmos/api-types/ws/dto/resource-monitor";
import {
  DEFAULT_CENTER_SPACE_ID,
  makeCenterSpaceKey,
  parseCenterSpaceKey,
} from "@/app-shell/center-space/center-space";
import {
  AGENT_TOOL,
  AGENT_TOOL_LABELS,
  type AgentStatusRecord,
  type AgentToolType,
} from "@/features/agent/store/agent-status-store";
import {
  findAgentChatCenterTab,
  type AgentChatCenterTab,
} from "@/features/agent/store/use-agent-chat-center-tabs";
import { EMPTY_RESOURCE_USAGE } from "@/features/resource-monitor/lib/resource-monitor-hierarchy";
import type { ResourceMonitorListedSession } from "@/features/resource-monitor/lib/resource-monitor-listed-session";
import type { Project } from "@/shared/types/domain";

export type {
  ResourceMonitorListedSession,
  ResourceMonitorSessionUiKind,
} from "@/features/resource-monitor/lib/resource-monitor-listed-session";
export {
  agentStatusForResourceMonitorChat,
  canLocateResourceMonitorChatSession,
  isResourceMonitorChatSession,
  resourceMonitorSessionUiKind,
} from "@/features/resource-monitor/lib/resource-monitor-listed-session";

function chatStatusSessionId(chatId: string): string {
  return `chat:${chatId.trim()}`;
}

function parseChatStatusSessionId(
  sessionId: string | null | undefined,
): string | null {
  const id = sessionId?.trim() ?? "";
  if (!id.startsWith("chat:")) return null;
  return id.slice("chat:".length) || null;
}

export type ResourceMonitorChatPlacement = {
  sessionId: string;
  chatId: string;
  name: string;
  projectId: string;
  projectName: string;
  workspaceId: string | null;
  workspaceName: string | null;
  spaceId: string;
  agentStatus: AgentStatusRecord;
  toolbarAgent: TerminalTitleAgent;
};

type ContextIndex = {
  projectId: string;
  projectName: string;
  workspaceId: string | null;
  workspaceName: string | null;
};

function isAgentToolType(value: string | null | undefined): value is AgentToolType {
  return typeof value === "string" && value in AGENT_TOOL_LABELS;
}

function asAgentTool(value: string | null | undefined): AgentToolType {
  return isAgentToolType(value) ? value : AGENT_TOOL.AGENT;
}

function toolbarAgentForChat(
  providerId: string | null | undefined,
  tool: AgentToolType,
): TerminalTitleAgent {
  const id = providerId?.trim() || tool;
  return {
    id,
    label: AGENT_TOOL_LABELS[tool] ?? id,
    command: "",
    iconType: "built-in",
  };
}

function indexResourceMonitorContexts(
  projects: readonly Project[],
): Map<string, ContextIndex> {
  const index = new Map<string, ContextIndex>();
  for (const project of projects) {
    index.set(project.id, {
      projectId: project.id,
      projectName: project.name,
      workspaceId: null,
      workspaceName: null,
    });
    for (const workspace of project.workspaces) {
      index.set(workspace.id, {
        projectId: project.id,
        projectName: project.name,
        workspaceId: workspace.id,
        workspaceName:
          workspace.displayName?.trim() || workspace.name || workspace.branch,
      });
    }
  }
  return index;
}

function chatIdFromStatus(session: AgentStatusRecord): string | null {
  if (session.surface !== "chat") return null;
  return (
    session.surface_id?.trim() ||
    parseChatStatusSessionId(session.session_id) ||
    null
  );
}

function synthesizeChatStatus(input: {
  chatId: string;
  hostId: string;
  spaceId: string;
  tab: AgentChatCenterTab;
}): AgentStatusRecord {
  const providerId = input.tab.providerId?.trim() || null;
  return {
    session_id: chatStatusSessionId(input.chatId),
    tool: asAgentTool(providerId),
    state: "idle",
    timestamp: new Date(input.tab.openedAt).toISOString(),
    context_id: input.hostId,
    surface: "chat",
    surface_id: input.chatId,
    space_id: input.spaceId,
    provider_id: providerId,
  };
}

function placementFromChat(input: {
  chatId: string;
  context: ContextIndex;
  spaceId: string;
  tab: AgentChatCenterTab | undefined;
  agentStatus: AgentStatusRecord;
}): ResourceMonitorChatPlacement {
  const tool = asAgentTool(input.agentStatus.tool);
  const providerId =
    input.agentStatus.provider_id?.trim() || input.tab?.providerId?.trim() || null;
  const title = input.tab?.title?.trim();
  return {
    sessionId: chatStatusSessionId(input.chatId),
    chatId: input.chatId,
    name: title || AGENT_TOOL_LABELS[tool] || tool,
    projectId: input.context.projectId,
    projectName: input.context.projectName,
    workspaceId: input.context.workspaceId,
    workspaceName: input.context.workspaceName,
    spaceId: input.spaceId || DEFAULT_CENTER_SPACE_ID,
    agentStatus: input.agentStatus,
    toolbarAgent: toolbarAgentForChat(providerId, tool),
  };
}

/**
 * Open Chat UI sessions for the Resource Monitor tree.
 * Union of agent-status chat rows and open center-chat tabs, placed by host
 * workspace/project. Draft tabs without a chat id are skipped.
 */
export function collectResourceMonitorChatSessions(input: {
  agentSessions: Iterable<AgentStatusRecord>;
  chatTabsByContext: Record<string, readonly AgentChatCenterTab[]>;
  projects: readonly Project[];
}): ResourceMonitorChatPlacement[] {
  const contexts = indexResourceMonitorContexts(input.projects);
  if (contexts.size === 0) return [];

  const byChatId = new Map<string, ResourceMonitorChatPlacement>();

  for (const session of input.agentSessions) {
    const chatId = chatIdFromStatus(session);
    const hostId = session.context_id?.trim();
    if (!chatId || !hostId) continue;
    const context = contexts.get(hostId);
    if (!context) continue;
    const preferredPaint = makeCenterSpaceKey(
      hostId,
      session.space_id?.trim() || DEFAULT_CENTER_SPACE_ID,
    );
    const tab = findAgentChatCenterTab(
      input.chatTabsByContext,
      chatId,
      preferredPaint,
    );
    const spaceId = tab
      ? parseCenterSpaceKey(tab.contextId).spaceId
      : session.space_id?.trim() || DEFAULT_CENTER_SPACE_ID;
    byChatId.set(
      chatId,
      placementFromChat({
        chatId,
        context,
        spaceId,
        tab,
        agentStatus: {
          ...session,
          space_id: spaceId,
        },
      }),
    );
  }

  for (const [contextKey, tabs] of Object.entries(input.chatTabsByContext)) {
    const { hostId, spaceId } = parseCenterSpaceKey(contextKey);
    const context = contexts.get(hostId);
    if (!context) continue;
    for (const tab of tabs) {
      const chatId = tab.chatId?.trim();
      if (!chatId || byChatId.has(chatId)) continue;
      byChatId.set(
        chatId,
        placementFromChat({
          chatId,
          context,
          spaceId,
          tab,
          agentStatus: synthesizeChatStatus({ chatId, hostId, spaceId, tab }),
        }),
      );
    }
  }

  return [...byChatId.values()].sort((left, right) =>
    left.name.localeCompare(right.name) || left.sessionId.localeCompare(right.sessionId),
  );
}

function listedChatSession(
  chat: ResourceMonitorChatPlacement,
): ResourceMonitorListedSession {
  return {
    session_id: chat.sessionId,
    name: chat.name,
    terminal_kind: "chat",
    usage: { ...EMPTY_RESOURCE_USAGE },
    processes: [],
    uiKind: "chat",
    agentStatus: chat.agentStatus,
    spaceId: chat.spaceId,
  };
}

function upsertChatSession(
  sessions: ResourceSessionMetrics[],
  session: ResourceMonitorListedSession,
): ResourceSessionMetrics[] {
  const listed = sessions as ResourceMonitorListedSession[];
  const index = listed.findIndex((item) => item.session_id === session.session_id);
  if (index === -1) return [...listed, session];
  const existing = listed[index];
  if (!existing) return [...listed, session];
  const next = [...listed];
  next[index] = {
    ...existing,
    ...session,
    usage: existing.usage,
    processes: existing.processes,
    name: existing.name ?? session.name,
    terminal_kind: existing.terminal_kind || session.terminal_kind,
    uiKind: "chat",
    agentStatus: session.agentStatus ?? existing.agentStatus,
    spaceId: session.spaceId ?? existing.spaceId,
  };
  return next;
}

function emptyWorkspace(
  workspaceId: string,
  name: string,
): ResourceWorkspaceMetrics {
  return {
    workspace_id: workspaceId,
    name,
    usage: { ...EMPTY_RESOURCE_USAGE },
    sessions: [],
    other_usage: { ...EMPTY_RESOURCE_USAGE },
    other_processes: [],
  };
}

function emptyProject(projectId: string, name: string): ResourceProjectMetrics {
  return {
    project_id: projectId,
    name,
    usage: { ...EMPTY_RESOURCE_USAGE },
    direct_usage: { ...EMPTY_RESOURCE_USAGE },
    workspaces: [],
    sessions: [],
    other_usage: { ...EMPTY_RESOURCE_USAGE },
    other_processes: [],
  };
}

/**
 * Copy-on-write merge of Chat UI sessions into the Resource Monitor tree.
 * Injects missing project/workspace rows so a chat-only host still appears.
 */
export function mergeResourceMonitorChatSessions(
  projects: readonly ResourceProjectMetrics[],
  chats: readonly ResourceMonitorChatPlacement[],
): ResourceProjectMetrics[] {
  if (chats.length === 0) return [...projects];

  const next = projects.map((project) => ({
    ...project,
    sessions: [...project.sessions],
    workspaces: project.workspaces.map((workspace) => ({
      ...workspace,
      sessions: [...workspace.sessions],
    })),
  }));
  const byProject = new Map(next.map((project) => [project.project_id, project]));

  for (const chat of chats) {
    let project = byProject.get(chat.projectId);
    if (!project) {
      project = emptyProject(chat.projectId, chat.projectName);
      next.push(project);
      byProject.set(chat.projectId, project);
    }
    const listed = listedChatSession(chat);
    if (chat.workspaceId) {
      let workspace = project.workspaces.find(
        (item) => item.workspace_id === chat.workspaceId,
      );
      if (!workspace) {
        workspace = emptyWorkspace(
          chat.workspaceId,
          chat.workspaceName ?? chat.workspaceId,
        );
        project.workspaces = [...project.workspaces, workspace];
      }
      workspace.sessions = upsertChatSession(workspace.sessions, listed);
    } else {
      project.sessions = upsertChatSession(project.sessions, listed);
    }
  }

  return next;
}
