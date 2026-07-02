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

export function navigateToAgentHookSessionPane(
  session: AgentHookSession,
  router: { push: (path: string) => void },
  projects: Project[],
) {
  const contextId = session.context_id;
  const paneId = session.side_chat_id
    ? session.source_pane_id ?? session.pane_id
    : session.pane_id;

  if (!contextId || !paneId) return;

  const tmuxWindowName = paneId.split(":").slice(1).join(":");
  if (!tmuxWindowName) return;

  let basePath = "/workspace";
  for (const project of projects) {
    if (project.id === contextId) {
      basePath = "/project";
      break;
    }
    const ws = project.workspaces.find((w) => w.id === contextId);
    if (ws) {
      basePath = "/workspace";
      break;
    }
  }

  const hit = findWorkspacePaneIdsByTmuxWindowName(
    useTerminalStore.getState(),
    contextId,
    tmuxWindowName,
    basePath === "/project",
  );

  const params = new URLSearchParams();
  params.set("id", contextId);
  if (hit?.terminalTabId) {
    params.set("tab", hit.terminalTabId);
  }
  params.set("terminalTmux", tmuxWindowName);
  if (session.side_chat_id) {
    params.set("sideChat", session.side_chat_id);
  }
  router.push(`${basePath}?${params.toString()}`);
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
