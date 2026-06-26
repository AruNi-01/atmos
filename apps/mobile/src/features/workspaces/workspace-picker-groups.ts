import type { ProjectModel, WorkspaceModel } from "@/api/types";

export type WorkspaceProjectGroup = {
  project: ProjectModel;
  workspaces: WorkspaceModel[];
};

export function buildWorkspaceProjectGroups(
  projects: ProjectModel[],
  workspacesByProject: Record<string, WorkspaceModel[]>,
): WorkspaceProjectGroup[] {
  const projectById = new Map(projects.map((project) => [project.guid, project]));
  const groups = projects.map((project) => ({
    project,
    workspaces: workspacesByProject[project.guid] ?? [],
  }));

  const orphanedWorkspaces = Object.entries(workspacesByProject)
    .filter(([projectId]) => !projectById.has(projectId))
    .flatMap(([, workspaces]) => workspaces);

  if (orphanedWorkspaces.length > 0) {
    groups.push({
      project: {
        border_color: null,
        created_at: "",
        guid: "__other__",
        is_deleted: false,
        main_file_path: "",
        name: "Other",
        sidebar_order: Number.MAX_SAFE_INTEGER,
        updated_at: "",
      },
      workspaces: orphanedWorkspaces,
    });
  }

  return groups;
}
