import { hostIdFromCenterKey } from "@/app-shell/center-space/center-space";
import {
  draftPromptTitle,
  type AgentChatCenterTab,
} from "@/features/agent/store/use-agent-chat-center-tabs";
import type { Project, Workspace } from "@/shared/types/domain";

import type { SidebarSessionRow } from "./session-grouping";

export function newChatDraftSessionRows(input: {
  tabsByContext: Record<string, readonly AgentChatCenterTab[]>;
  projects: readonly Project[];
}): SidebarSessionRow[] {
  const located = indexHosts(input.projects);
  const rows: SidebarSessionRow[] = [];
  for (const tabs of Object.values(input.tabsByContext)) {
    for (const tab of tabs) {
      if (tab.chatId) continue;
      const prompt = tab.draftPrompt?.trim() ?? "";
      if (!prompt) continue;
      const hostId = hostIdFromCenterKey(tab.contextId);
      const place = located.get(hostId);
      if (!place || place.workspace?.isArchived) continue;
      rows.push({
        sessionId: `new-chat:${tab.value}`,
        contextId: hostId,
        surface: "chat",
        surfaceId: null,
        tool: null,
        groupKey: "done",
        updatedAt: new Date(tab.openedAt).toISOString(),
        title: draftPromptTitle(prompt),
        projectId: place.project.id,
        projectName: place.project.name?.trim() || null,
        projectPath: place.project.mainFilePath ?? null,
        workspaceName: place.workspace ? workspaceDisplayName(place.workspace) : null,
        branch: place.workspace?.branch?.trim() || null,
        workspace: place.workspace,
        draftTab: { contextId: tab.contextId, value: tab.value },
      });
    }
  }
  return rows;
}

export function newChatDraftTabTarget(sessionId: string): string | null {
  if (!sessionId.startsWith("new-chat:")) return null;
  const value = sessionId.slice("new-chat:".length).trim();
  return value || null;
}

function workspaceDisplayName(workspace: Workspace): string {
  const display = workspace.displayName?.trim();
  if (display) return display;
  return workspace.name.trim();
}

function indexHosts(projects: readonly Project[]) {
  const located = new Map<string, { project: Project; workspace: Workspace | null }>();
  for (const project of projects) {
    located.set(project.id, { project, workspace: null });
    for (const workspace of project.workspaces) {
      located.set(workspace.id, { project, workspace });
    }
  }
  return located;
}
