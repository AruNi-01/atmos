import type { Project } from "@/shared/types/domain";

export const FOOTER_MODAL_CHAT_INSTANCE_KEY = "footer-modal";

export const FOOTER_MODAL_CHAT_PREF_KEY = {
  workspaceId: null as string | null,
  projectId: null as string | null,
};

export type AgentChatWorkingDirectory = {
  workspaceId: string | null;
  projectId: string | null;
  cwd: string | null;
};

export const THREAD_WORKING_DIRECTORY: AgentChatWorkingDirectory = {
  workspaceId: null,
  projectId: null,
  cwd: null,
};

export function isThreadWorkingDirectory(
  selection: AgentChatWorkingDirectory,
): boolean {
  return !selection.workspaceId && !selection.projectId;
}

export function workingDirectoriesEqual(
  a: AgentChatWorkingDirectory,
  b: AgentChatWorkingDirectory,
): boolean {
  return (
    a.workspaceId === b.workspaceId &&
    a.projectId === b.projectId &&
    (a.cwd || "") === (b.cwd || "")
  );
}

export function resolveWorkingDirectoryLabel(
  selection: AgentChatWorkingDirectory,
  projects: Project[],
  threadLabel: string,
): string {
  if (selection.workspaceId) {
    for (const project of projects) {
      const workspace = project.workspaces.find((item) => item.id === selection.workspaceId);
      if (workspace) return workspace.displayName || workspace.name;
    }
  }
  if (selection.projectId) {
    const project = projects.find((item) => item.id === selection.projectId);
    if (project) return project.name;
  }
  return threadLabel;
}
