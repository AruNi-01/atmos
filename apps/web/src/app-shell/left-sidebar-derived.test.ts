import { describe, expect, it } from "bun:test";

import { getProjectModeProjects, mergeExpandedProjectIds } from "@/app-shell/left-sidebar-derived";
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

describe("mergeExpandedProjectIds", () => {
  it("expands every project on first load without mutating the seen set", () => {
    const seen = new Set<string>();
    const result = mergeExpandedProjectIds([], ["a", "b"], seen);
    expect(result.expandedIds).toEqual(["a", "b"]);
    expect(result.nextSeenIds).toEqual(new Set(["a", "b"]));
    expect(seen.size).toBe(0);
  });

  it("returns a full expansion twice when the seen set is still empty", () => {
    const seen = new Set<string>();
    expect(mergeExpandedProjectIds([], ["a", "b"], seen).expandedIds).toEqual(["a", "b"]);
    expect(mergeExpandedProjectIds([], ["a", "b"], seen).expandedIds).toEqual(["a", "b"]);
    expect(seen.size).toBe(0);
  });

  it("does not re-expand after the user collapses the last project", () => {
    const seen = new Set(["a", "b"]);
    expect(mergeExpandedProjectIds([], ["a", "b"], seen).expandedIds).toEqual([]);
    expect(seen).toEqual(new Set(["a", "b"]));
  });

  it("expands only newly seen projects without mutating the seen set", () => {
    const seen = new Set(["a"]);
    const result = mergeExpandedProjectIds(["a"], ["a", "b"], seen);
    expect(result.expandedIds).toEqual(["a", "b"]);
    expect(result.nextSeenIds.has("b")).toBe(true);
    expect(seen.has("b")).toBe(false);
  });
});
