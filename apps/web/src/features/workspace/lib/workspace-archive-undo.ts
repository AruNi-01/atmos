import type { ComputerQueryScope } from "@/api/query/query-scope";
import type { ProjectBootstrapSnapshot } from "@/features/project/lib/project-query-options";
import { sortWorkspaces } from "@/features/project/store/project-store-mappers";
import type { Workspace } from "@/shared/types/domain";

export const WORKSPACE_ARCHIVE_UNDO_SECONDS = 5;

export interface PendingWorkspaceArchive {
  projectId: string;
  workspace: Workspace;
  restoreHref: string | null;
  wasActive: boolean;
  scope: ComputerQueryScope;
}

export function workspaceArchiveDisplayName(
  workspace: Pick<Workspace, "name" | "displayName">,
  untitled: string,
): string {
  const name = workspace.displayName?.trim() || workspace.name.trim();
  return name || untitled;
}

export function findWorkspaceInSnapshot(
  snapshot: ProjectBootstrapSnapshot | undefined,
  projectId: string,
  workspaceId: string,
): Workspace | undefined {
  return snapshot?.projects
    .find((project) => project.id === projectId)
    ?.workspaces.find((workspace) => workspace.id === workspaceId);
}

export function removeWorkspaceFromSnapshot(
  snapshot: ProjectBootstrapSnapshot,
  projectId: string,
  workspaceId: string,
): ProjectBootstrapSnapshot {
  return {
    ...snapshot,
    projects: snapshot.projects.map((project) =>
      project.id === projectId
        ? {
            ...project,
            workspaces: project.workspaces.filter((workspace) => workspace.id !== workspaceId),
          }
        : project,
    ),
  };
}

export function restoreWorkspaceToSnapshot(
  snapshot: ProjectBootstrapSnapshot,
  projectId: string,
  workspace: Workspace,
): ProjectBootstrapSnapshot {
  return {
    ...snapshot,
    projects: snapshot.projects.map((project) => {
      if (project.id !== projectId) return project;
      const without = project.workspaces.filter((item) => item.id !== workspace.id);
      return {
        ...project,
        workspaces: sortWorkspaces([
          ...without,
          { ...workspace, isArchived: false, archivedAt: undefined },
        ]),
      };
    }),
  };
}

export function workspaceRestoreHref(workspaceId: string, href: string): string | null {
  try {
    const url = new URL(href, "http://atmos.local");
    const pathname = url.pathname.replace(/\/+$/, "") || "/";
    if (!pathname.endsWith("/workspace")) return null;
    if (url.searchParams.get("id") !== workspaceId) return null;
    return `/workspace?id=${workspaceId}`;
  } catch {
    return null;
  }
}

export function resolveWorkspaceArchiveRestoreHref(input: {
  workspaceId: string;
  wasActive: boolean;
  href: string;
}): string | null {
  if (input.wasActive) return `/workspace?id=${input.workspaceId}`;
  return workspaceRestoreHref(input.workspaceId, input.href);
}
