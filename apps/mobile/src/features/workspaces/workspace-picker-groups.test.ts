// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
import type { ProjectModel, WorkspaceModel } from "@/api/types";
import { buildWorkspaceProjectGroups } from "./workspace-picker-groups";

function project(guid: string, name: string): ProjectModel {
  return {
    border_color: null,
    created_at: "2026-01-01T00:00:00Z",
    guid,
    is_deleted: false,
    main_file_path: `/repo/${name}`,
    name,
    sidebar_order: 0,
    updated_at: "2026-01-01T00:00:00Z",
  };
}

function workspace(guid: string, projectGuid: string): WorkspaceModel {
  return {
    archived_at: null,
    base_branch: "main",
    branch: "feature/test",
    create_source: "manual",
    created_at: "2026-01-01T00:00:00Z",
    display_name: "Test Workspace",
    github_issue: null,
    github_pr: null,
    guid,
    is_archived: false,
    is_deleted: false,
    is_pinned: false,
    labels: [],
    last_visited_at: null,
    local_path: `/repo/worktrees/${guid}`,
    name: "test-workspace",
    pin_order: null,
    pinned_at: null,
    priority: "no_priority",
    project_guid: projectGuid,
    sidebar_order: 0,
    updated_at: "2026-01-01T00:00:00Z",
    workflow_status: "in_progress",
  };
}

describe("workspace picker groups", () => {
  test("keeps imported projects that do not have workspaces yet", () => {
    const groups = buildWorkspaceProjectGroups(
      [project("project-atmos", "Atmos")],
      { "project-atmos": [] },
    );

    expect(groups).toHaveLength(1);
    expect(groups[0]?.project.guid).toBe("project-atmos");
    expect(groups[0]?.workspaces).toEqual([]);
  });

  test("keeps orphaned workspaces in an Other group", () => {
    const groups = buildWorkspaceProjectGroups(
      [project("project-atmos", "Atmos")],
      {
        "project-atmos": [],
        "missing-project": [workspace("workspace-1", "missing-project")],
      },
    );

    expect(groups.map((group) => group.project.guid)).toEqual(["project-atmos", "__other__"]);
    expect(groups[1]?.workspaces.map((item) => item.guid)).toEqual(["workspace-1"]);
  });
});
