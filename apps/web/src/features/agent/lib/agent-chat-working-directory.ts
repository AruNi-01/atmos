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

const AGENT_SCRATCH_CWD_RE = /(?:^|[/\\])\.atmos[/\\]data[/\\]agent[/\\]scratch$/i;

export function isAgentScratchCwd(cwd: string | null | undefined): boolean {
  const trimmed = cwd?.trim();
  if (!trimmed) return false;
  const normalized = trimmed.replace(/\\/g, "/").replace(/\/+$/, "");
  return AGENT_SCRATCH_CWD_RE.test(normalized);
}

export function agentChatCwdLabel(
  cwd: string | null | undefined,
  threadLabel: string,
): string | null {
  const trimmed = cwd?.trim();
  if (!trimmed) return null;
  if (isAgentScratchCwd(trimmed)) return threadLabel;
  return trimmed;
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

export type WorkingDirectoryMenuProject = {
  project: Project;
  workspaces: Project["workspaces"];
};

export function activeWorkspaces(project: Project): Project["workspaces"] {
  return project.workspaces.filter((workspace) => !workspace.isArchived);
}

export function filterWorkingDirectoryMenu(
  projects: Project[],
  query: string,
  threadLabel: string,
): {
  showThread: boolean;
  projects: WorkingDirectoryMenuProject[];
} {
  const q = query.trim().toLowerCase();
  const showThread = !q || threadLabel.toLowerCase().includes(q);
  const next: WorkingDirectoryMenuProject[] = [];
  for (const project of projects) {
    const workspaces = activeWorkspaces(project);
    if (!q) {
      next.push({ project, workspaces });
      continue;
    }
    const projectMatch = project.name.toLowerCase().includes(q);
    const matchedWorkspaces = workspaces.filter((workspace) => {
      const name = `${workspace.displayName || ""} ${workspace.name}`.toLowerCase();
      return name.includes(q);
    });
    if (projectMatch) {
      next.push({ project, workspaces });
    } else if (matchedWorkspaces.length > 0) {
      next.push({ project, workspaces: matchedWorkspaces });
    }
  }
  return { showThread, projects: next };
}

export function filterProjectWorkspaceFlyout(
  projectName: string,
  workspaces: Project["workspaces"],
  query: string,
): {
  showProject: boolean;
  workspaces: Project["workspaces"];
} {
  const q = query.trim().toLowerCase();
  if (!q) return { showProject: true, workspaces };
  const showProject = projectName.toLowerCase().includes(q);
  const matched = workspaces.filter((workspace) => {
    const name = `${workspace.displayName || ""} ${workspace.name}`.toLowerCase();
    return name.includes(q);
  });
  return { showProject, workspaces: matched };
}
