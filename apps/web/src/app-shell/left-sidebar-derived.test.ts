import { describe, expect, it } from "bun:test";

import { getProjectModeProjects } from "@/app-shell/left-sidebar-derived";
import type { Project, Workspace } from "@/shared/types/domain";
import type { FlattenedWorkspaceEntry } from "@/app-shell/sidebar/workspace-grouping";

function workspace(overrides: Partial<Workspace> = {}): Workspace {
  return {
    id: overrides.id ?? "workspace-1",
    name: overrides.name ?? "workspace-1",
    branch: overrides.branch ?? "main",
    baseBranch: overrides.baseBranch ?? "main",
    isActive: overrides.isActive ?? false,
    status: overrides.status ?? "clean",
    projectId: overrides.projectId ?? "project-1",
    isPinned: overrides.isPinned ?? false,
    isArchived: overrides.isArchived ?? false,
    createdAt: overrides.createdAt ?? "2026-01-01T00:00:00.000Z",
    workflowStatus: overrides.workflowStatus ?? "in_progress",
    priority: overrides.priority ?? "no_priority",
    labels: overrides.labels ?? [],
    localPath: overrides.localPath ?? "/tmp/project/workspace",
    createSource: overrides.createSource ?? "manual",
    ...overrides,
  };
}

function project(overrides: Partial<Project> = {}): Project {
  return {
    id: overrides.id ?? "project-1",
    name: overrides.name ?? "Project",
    isOpen: overrides.isOpen ?? true,
    workspaces: overrides.workspaces ?? [],
    mainFilePath: overrides.mainFilePath ?? "/tmp/project",
    sidebarOrder: overrides.sidebarOrder ?? 0,
    borderColor: overrides.borderColor ?? null,
    logoPath: overrides.logoPath ?? null,
    ...overrides,
  };
}

function entry(project: Project, workspace: Workspace): FlattenedWorkspaceEntry {
  return {
    projectId: project.id,
    projectName: project.name,
    projectPath: project.mainFilePath,
    workspace,
  };
}

describe("getProjectModeProjects", () => {
  it("keeps empty projects when only default workspace visibility rules are applied", () => {
    const emptyProject = project({ id: "empty", name: "Imported Project" });
    const automationWorkspace = workspace({
      id: "automation-workspace",
      projectId: "automation-project",
      createSource: "automation",
    });
    const automationProject = project({
      id: "automation-project",
      name: "Automation Project",
      workspaces: [automationWorkspace],
    });

    const projects = getProjectModeProjects(
      [emptyProject, automationProject],
      [],
      {
        hideProjectsWithoutVisibleWorkspaces: false,
        shouldApplyWorkspaceFilter: true,
      },
    );

    expect(projects).toEqual([
      emptyProject,
      { ...automationProject, workspaces: [] },
    ]);
  });

  it("hides projects without matching workspaces when explicit filters are active", () => {
    const emptyProject = project({ id: "empty", name: "Imported Project" });
    const visibleWorkspace = workspace({ id: "visible", projectId: "visible-project" });
    const visibleProject = project({
      id: "visible-project",
      name: "Visible Project",
      workspaces: [visibleWorkspace],
    });

    const projects = getProjectModeProjects(
      [emptyProject, visibleProject],
      [entry(visibleProject, visibleWorkspace)],
      {
        hideProjectsWithoutVisibleWorkspaces: true,
        shouldApplyWorkspaceFilter: true,
      },
    );

    expect(projects).toEqual([visibleProject]);
  });
});
