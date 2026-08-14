"use client";

import { createTranslator } from "next-intl";
import {
  findWorkspacePaneIdsByTmuxWindowName,
  useTerminalStore,
} from "@/features/terminal/store/use-terminal-store";
import type { AgentHookSession } from "@/features/agent/store/agent-hooks-store";
import { currentAppLocale } from "@/shared/lib/current-app-locale";
import type { Project } from "@/shared/types/domain";
import enMessages from "../../../../messages/en.json";
import zhMessages from "../../../../messages/zh.json";

let cachedAgentLocale: 'en' | 'zh' | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cachedAgentTranslator: any = null;

function agentT(key: string): string {
  const locale = currentAppLocale('en') === 'zh' ? 'zh' : 'en';
  if (!cachedAgentTranslator || cachedAgentLocale !== locale) {
    cachedAgentLocale = locale;
    cachedAgentTranslator = createTranslator({
      locale,
      messages: locale === 'zh' ? zhMessages : enMessages,
      namespace: 'Agent.chrome',
    });
  }
  return cachedAgentTranslator(key as never);
}

export type AgentHookNavigationTarget = {
  contextId: string | null;
  isSideChat: boolean;
  sideChatId: string | null;
  tmuxWindowName: string | null;
};

export function isAgentHookSideChatSession(session: {
  side_chat_id?: string | null;
  terminal_kind?: string | null;
}): boolean {
  if (session.side_chat_id?.trim()) return true;
  return session.terminal_kind === "side_chat";
}

/** Prefer the source mosaic/canvas pane for side chats; never the side tmux window. */
export function resolveAgentHookNavigationTarget(session: {
  context_id?: string | null;
  pane_id?: string | null;
  side_chat_id?: string | null;
  source_pane_id?: string | null;
  terminal_kind?: string | null;
}): AgentHookNavigationTarget {
  const sideChatId = session.side_chat_id?.trim() || null;
  const isSideChat = isAgentHookSideChatSession(session);
  const paneId = (
    isSideChat ? session.source_pane_id ?? session.pane_id : session.pane_id
  )?.trim() || null;
  const tmuxWindowName = paneId
    ? paneId.split(":").slice(1).join(":") || null
    : null;
  return {
    contextId: session.context_id?.trim() || null,
    isSideChat,
    sideChatId,
    tmuxWindowName,
  };
}

export function canNavigateToAgentHookSession(session: {
  context_id?: string | null;
  pane_id?: string | null;
  side_chat_id?: string | null;
  source_pane_id?: string | null;
  terminal_kind?: string | null;
}): boolean {
  const target = resolveAgentHookNavigationTarget(session);
  return Boolean(target.contextId && (target.tmuxWindowName || target.sideChatId));
}

export function buildAgentHookSessionPath(
  session: AgentHookSession,
  projects: Project[],
  hit: { terminalTabId: string } | null,
): string | null {
  const target = resolveAgentHookNavigationTarget(session);
  if (!target.contextId || (!target.tmuxWindowName && !target.sideChatId)) {
    return null;
  }

  let basePath = "/workspace";
  for (const project of projects) {
    if (project.id === target.contextId) {
      basePath = "/project";
      break;
    }
    const ws = project.workspaces.find((w) => w.id === target.contextId);
    if (ws) {
      basePath = "/workspace";
      break;
    }
  }

  const params = new URLSearchParams();
  params.set("id", target.contextId);
  if (hit?.terminalTabId) {
    params.set("tab", hit.terminalTabId);
  }
  if (target.tmuxWindowName) {
    params.set("terminalTmux", target.tmuxWindowName);
  }
  if (target.sideChatId) {
    params.set("sideChat", target.sideChatId);
  }
  return `${basePath}?${params.toString()}`;
}

export function navigateToAgentHookSessionPane(
  session: AgentHookSession,
  router: { push: (path: string) => void },
  projects: Project[],
) {
  const target = resolveAgentHookNavigationTarget(session);
  if (!target.contextId) return;

  let basePath = "/workspace";
  for (const project of projects) {
    if (project.id === target.contextId) {
      basePath = "/project";
      break;
    }
    const ws = project.workspaces.find((w) => w.id === target.contextId);
    if (ws) {
      basePath = "/workspace";
      break;
    }
  }

  const hit = target.tmuxWindowName
    ? findWorkspacePaneIdsByTmuxWindowName(
        useTerminalStore.getState(),
        target.contextId,
        target.tmuxWindowName,
        basePath === "/project",
      )
    : null;

  const path = buildAgentHookSessionPath(session, projects, hit);
  if (!path) return;
  router.push(path);
}

export function resolveAgentHookContextNames(
  contextId: string | null | undefined,
  projectPath: string | null | undefined,
  projects: Project[],
): {
  projectName: string;
  workspaceName: string | null;
  workspaceDisplayName: string | null;
} {
  if (contextId) {
    for (const project of projects) {
      if (project.id === contextId) {
        return { projectName: project.name, workspaceName: null, workspaceDisplayName: null };
      }

      const ws = project.workspaces.find((w) => w.id === contextId);
      if (ws) {
        const workspaceName = ws.name || ws.branch;
        const workspaceDisplayName = ws.displayName?.trim() || null;
        return {
          projectName: project.name,
          workspaceName,
          workspaceDisplayName:
            workspaceDisplayName && workspaceDisplayName !== workspaceName
              ? workspaceDisplayName
              : null,
        };
      }
    }
  }

  if (projectPath) {
    const normalized = projectPath.replace(/[\\/]+$/, "");
    const projectName = normalized.split(/[\\/]/).pop() || projectPath;
    return { projectName, workspaceName: null, workspaceDisplayName: null };
  }

  if (contextId) {
    return { projectName: contextId.slice(0, 8), workspaceName: null, workspaceDisplayName: null };
  }

  return { projectName: agentT("agentHookNavigation.unknownProject"), workspaceName: null, workspaceDisplayName: null };
}
