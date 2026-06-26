// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
import type { ProjectModel, ProjectWorkspaceBootstrapResponse } from "@/api/types";
import { addProjectToWorkspaceBootstrap } from "./project-bootstrap-cache";

function project(guid: string, sidebarOrder: number): ProjectModel {
  return {
    border_color: null,
    created_at: "2026-01-01T00:00:00Z",
    guid,
    is_deleted: false,
    main_file_path: `/repo/${guid}`,
    name: guid,
    sidebar_order: sidebarOrder,
    updated_at: "2026-01-01T00:00:00Z",
  };
}

describe("project bootstrap cache", () => {
  test("adds an imported project with an empty workspace bucket", () => {
    const current: ProjectWorkspaceBootstrapResponse = {
      projects: [project("project-a", 10)],
      workspace_labels: [],
      workspaces_by_project: { "project-a": [] },
    };

    const next = addProjectToWorkspaceBootstrap(current, project("project-b", 5));

    expect(next?.projects.map((item) => item.guid)).toEqual(["project-b", "project-a"]);
    expect(next?.workspaces_by_project["project-b"]).toEqual([]);
  });

  test("replaces an existing cached project without dropping workspaces", () => {
    const current: ProjectWorkspaceBootstrapResponse = {
      projects: [project("project-a", 10)],
      workspace_labels: [],
      workspaces_by_project: {
        "project-a": [
          {
            archived_at: null,
            base_branch: "main",
            branch: "feature/test",
            create_source: "manual",
            created_at: "2026-01-01T00:00:00Z",
            display_name: "Workspace",
            github_issue: null,
            github_pr: null,
            guid: "workspace-a",
            is_archived: false,
            is_deleted: false,
            is_pinned: false,
            labels: [],
            last_visited_at: null,
            local_path: "/repo/worktrees/workspace-a",
            name: "workspace-a",
            pin_order: null,
            pinned_at: null,
            priority: "no_priority",
            project_guid: "project-a",
            sidebar_order: 0,
            updated_at: "2026-01-01T00:00:00Z",
            workflow_status: "in_progress",
          },
        ],
      },
    };

    const next = addProjectToWorkspaceBootstrap(current, {
      ...project("project-a", 1),
      name: "Renamed",
    });

    expect(next?.projects).toHaveLength(1);
    expect(next?.projects[0]?.name).toBe("Renamed");
    expect(next?.workspaces_by_project["project-a"]?.[0]?.guid).toBe("workspace-a");
  });
});
