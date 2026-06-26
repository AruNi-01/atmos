import type { ProjectModel, ProjectWorkspaceBootstrapResponse } from "@/api/types";

export function addProjectToWorkspaceBootstrap(
  current: ProjectWorkspaceBootstrapResponse | undefined,
  project: ProjectModel,
): ProjectWorkspaceBootstrapResponse | undefined {
  if (!current) return current;

  const hasProject = current.projects.some((item) => item.guid === project.guid);
  const projects = (
    hasProject
      ? current.projects.map((item) => (item.guid === project.guid ? project : item))
      : [...current.projects, project]
  ).sort((a, b) => a.sidebar_order - b.sidebar_order);

  return {
    ...current,
    projects,
    workspaces_by_project: {
      ...current.workspaces_by_project,
      [project.guid]: current.workspaces_by_project[project.guid] ?? [],
    },
  };
}
