import type { Project } from "@/shared/types/domain";

export type AgentChatSkillsContext = {
  mode: "project" | "workspace";
  id: string;
  name: string;
  path: string;
};

export function resolveAgentChatSkillsContext({
  activeProjectId,
  sessionWorkspaceId,
  projectPath,
  projects,
}: {
  activeProjectId: string | null;
  sessionWorkspaceId: string | null;
  projectPath: string | null;
  projects: Project[];
}): AgentChatSkillsContext | null {
  if (!projectPath) return null;
  if (sessionWorkspaceId) {
    for (const project of projects) {
      const workspace = project.workspaces.find((item) => item.id === sessionWorkspaceId);
      if (workspace) {
        return {
          mode: "workspace",
          id: sessionWorkspaceId,
          name: workspace.displayName || workspace.name,
          path: workspace.localPath || projectPath,
        };
      }
    }
    return {
      mode: "workspace",
      id: sessionWorkspaceId,
      name: sessionWorkspaceId,
      path: projectPath,
    };
  }
  if (activeProjectId) {
    const project = projects.find((item) => item.id === activeProjectId);
    return {
      mode: "project",
      id: activeProjectId,
      name: project?.name ?? activeProjectId,
      path: project?.mainFilePath || projectPath,
    };
  }
  return null;
}
