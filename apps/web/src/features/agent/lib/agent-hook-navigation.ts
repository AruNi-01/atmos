"use client";

import {
  findWorkspacePaneIdsByTmuxWindowName,
  useTerminalStore,
} from "@/features/terminal/store/use-terminal-store";
import type { AgentHookSession } from "@/features/agent/store/agent-hooks-store";
import type { Project } from "@/shared/types/domain";

export function navigateToAgentHookSessionPane(
  session: AgentHookSession,
  router: { push: (path: string) => void },
  projects: Project[],
) {
  const contextId = session.context_id;
  const paneId = session.pane_id;

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
  );

  const params = new URLSearchParams();
  params.set("id", contextId);
  if (hit?.terminalTabId) {
    params.set("tab", hit.terminalTabId);
  }
  params.set("terminalTmux", tmuxWindowName);
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

  return { projectName: "Unknown project", workspaceName: null, workspaceDisplayName: null };
}
