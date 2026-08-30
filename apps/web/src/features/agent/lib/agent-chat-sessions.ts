"use client";

import type { AgentChatIndexEntry } from "@atmos/api-types/ws/dto/agent-chat";
import { parseUTCDate } from "@atmos/shared";
import {
  DEFAULT_CENTER_SPACE_ID,
  makeCenterSpaceKey,
} from "@/app-shell/center-space/center-space";
import {
  commitLocatedPaneNavigation,
  type NavigateToLocatedPaneRouter,
} from "@/features/terminal/public/navigate-to-located-pane";
import {
  buildAgentChatTabValue,
  useAgentChatCenterTabsStore,
} from "@/features/agent/store/use-agent-chat-center-tabs";
import type { Project } from "@/shared/types/domain";
import {
  agentChatCwdLabel,
  isAgentScratchCwd,
  isThreadWorkingDirectory,
} from "@/features/agent/lib/agent-chat-working-directory";

export const AGENT_CHAT_SESSIONS_PAGE_LIMIT = 100;
export const ALL_AGENT_FILTER_ID = "all";
export const ALL_SESSION_CONTEXT_ID = "all";
export const THREAD_SESSION_CONTEXT_ID = "thread";
export const DEFAULT_PROJECT_WORKSPACE_LIMIT = 10;

export type AgentChatSessionTimeGroup =
  | "today"
  | "yesterday"
  | "daysAgo2To6"
  | "weeksAgo1To3"
  | "monthsAgo1To5"
  | "older";

export const AGENT_CHAT_SESSION_GROUP_ORDER: AgentChatSessionTimeGroup[] = [
  "today",
  "yesterday",
  "daysAgo2To6",
  "weeksAgo1To3",
  "monthsAgo1To5",
  "older",
];

export function sameStringSet(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  const rightSet = new Set(right);
  return left.every((item) => rightSet.has(item));
}

export function normalizePathForMatch(path: string | null | undefined): string | null {
  const trimmed = path?.trim();
  if (!trimmed) return null;
  const slashNormalized = trimmed.replace(/\\/g, "/").replace(/\/+/g, "/");
  const withoutTrailingSlash = slashNormalized.replace(/\/+$/, "");
  if (!withoutTrailingSlash) return slashNormalized.startsWith("/") ? "/" : slashNormalized;
  if (/^[A-Za-z]:$/.test(withoutTrailingSlash)) return `${withoutTrailingSlash}/`;
  return withoutTrailingSlash;
}

function pathIsUnder(cwd: string, root: string): boolean {
  const cwdComparable = /^[A-Za-z]:\//.test(cwd) ? cwd.toLowerCase() : cwd;
  const rootComparable = /^[A-Za-z]:\//.test(root) ? root.toLowerCase() : root;
  if (cwdComparable === rootComparable) return true;
  return cwdComparable.startsWith(`${rootComparable}/`);
}

export type AgentChatLocationKind = "thread" | "project" | "workspace";

export type AgentChatLocationLabel = {
  kind: AgentChatLocationKind;
  label: string;
};

function workspaceName(workspace: Project["workspaces"][number]): string {
  return workspace.displayName?.trim() || workspace.name.trim() || workspace.id;
}

export function resolveAgentChatLocationLabel(
  chat: Pick<AgentChatIndexEntry, "cwd" | "workspace_id" | "project_id">,
  projects: Project[],
  threadLabel: string,
): AgentChatLocationLabel {
  const workspaceId = chat.workspace_id?.trim() || "";
  if (workspaceId) {
    for (const project of projects) {
      const workspace = project.workspaces.find((item) => item.id === workspaceId);
      if (!workspace) continue;
      return {
        kind: "workspace",
        label: `${project.name} - ${workspaceName(workspace)}`,
      };
    }
  }

  const projectId = chat.project_id?.trim() || "";
  if (projectId) {
    const project = projects.find((item) => item.id === projectId);
    if (project) {
      return { kind: "project", label: project.name };
    }
  }

  if (
    isThreadWorkingDirectory({
      workspaceId: chat.workspace_id,
      projectId: chat.project_id,
      cwd: chat.cwd,
    }) ||
    isAgentScratchCwd(chat.cwd)
  ) {
    return { kind: "thread", label: threadLabel };
  }

  return {
    kind: "project",
    label: agentChatCwdLabel(chat.cwd, threadLabel) ?? threadLabel,
  };
}

export function chatMatchesSessionScope(
  chat: Pick<AgentChatIndexEntry, "cwd" | "workspace_id" | "project_id">,
  input: {
    roots: string[] | null;
    selectedProjectId: string | null;
    selectedWorkspaceIds: string[];
    threadOnly?: boolean;
  },
): boolean {
  if (input.threadOnly) {
    return isThreadWorkingDirectory({
      workspaceId: chat.workspace_id,
      projectId: chat.project_id,
      cwd: chat.cwd,
    });
  }
  if (!input.roots) return true;
  if (
    input.selectedProjectId &&
    chat.project_id === input.selectedProjectId &&
    !chat.workspace_id
  ) {
    return true;
  }
  if (chat.workspace_id && input.selectedWorkspaceIds.includes(chat.workspace_id)) {
    return true;
  }
  const cwd = normalizePathForMatch(chat.cwd);
  if (!cwd) return false;
  return input.roots.some((root) => {
    const normalizedRoot = normalizePathForMatch(root);
    return Boolean(normalizedRoot && pathIsUnder(cwd, normalizedRoot));
  });
}

export function groupAgentChatSessionsByTime<T extends { updated_at: string | null }>(
  sessions: T[],
  now = new Date(),
): Record<AgentChatSessionTimeGroup, T[]> {
  const groups: Record<AgentChatSessionTimeGroup, T[]> = {
    today: [],
    yesterday: [],
    daysAgo2To6: [],
    weeksAgo1To3: [],
    monthsAgo1To5: [],
    older: [],
  };

  for (const session of sessions) {
    const date = session.updated_at ? parseUTCDate(session.updated_at) : null;
    if (!date || Number.isNaN(date.getTime())) {
      groups.older.push(session);
      continue;
    }

    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) groups.today.push(session);
    else if (diffDays === 1) groups.yesterday.push(session);
    else if (diffDays <= 6) groups.daysAgo2To6.push(session);
    else if (diffDays <= 21) groups.weeksAgo1To3.push(session);
    else if (diffDays <= 150) groups.monthsAgo1To5.push(session);
    else groups.older.push(session);
  }
  return groups;
}

export function routeKindForAgentChatContext(
  contextId: string,
  projects: Project[],
): "project" | "workspace" {
  for (const project of projects) {
    if (project.id === contextId) return "project";
    if (project.workspaces.some((workspace) => workspace.id === contextId)) {
      return "workspace";
    }
  }
  return "workspace";
}

export function buildAgentChatHistoryHref(
  entry: Pick<AgentChatIndexEntry, "id" | "workspace_id" | "project_id">,
  projects: Project[],
): string {
  const contextId = entry.workspace_id?.trim() || entry.project_id?.trim() || "";
  if (!contextId) {
    const params = new URLSearchParams();
    params.set("chatId", entry.id);
    return `/agent-chat?${params.toString()}`;
  }
  const params = new URLSearchParams();
  params.set("id", contextId);
  params.set("tab", buildAgentChatTabValue(entry.id));
  const kind = routeKindForAgentChatContext(contextId, projects);
  return `${kind === "project" ? "/project" : "/workspace"}?${params.toString()}`;
}

export async function openAgentChatHistoryRow(
  entry: AgentChatIndexEntry,
  router: NavigateToLocatedPaneRouter,
  projects: Project[],
): Promise<void> {
  const href = buildAgentChatHistoryHref(entry, projects);
  const contextId = entry.workspace_id?.trim() || entry.project_id?.trim() || "";
  if (!contextId) {
    router.push(href);
    return;
  }

  const spaceId = entry.space_id?.trim() || DEFAULT_CENTER_SPACE_ID;
  const paintContextId = makeCenterSpaceKey(contextId, spaceId);
  useAgentChatCenterTabsStore.getState().openTab({
    contextId: paintContextId,
    chatId: entry.id,
    title: entry.title,
    cwd: entry.cwd,
    providerId: entry.provider_id,
  });

  const { useCenterSpaceStore } = await import("@/app-shell/center-space/center-space-store");
  const store = useCenterSpaceStore.getState();
  if (!store.hydrated) store.hydrate();
  store.ensureHost(contextId);
  store.setActiveSpace(contextId, spaceId);
  commitLocatedPaneNavigation(router, href);
}
