// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
import type { GroupModel, ProjectModel, WorkspaceModel } from "@/api/types";
import {
  EMPTY_WORKSPACE_HOME_FILTERS,
  filterChoices,
  filterSelectionLabel,
  groupWorkspaceEntries,
  recentWorkspaceEntries,
  visibleWorkspaceEntries,
  WORKSPACE_PRIORITY_FILTER_OPTIONS,
  WORKSPACE_STATUS_FILTER_OPTIONS,
} from "./workspace-home-list";

function project(guid: string, name: string): ProjectModel {
  return {
    border_color: null,
    created_at: "",
    guid,
    is_deleted: false,
    main_file_path: "",
    name,
    sidebar_order: 0,
    updated_at: "",
  };
}

function workspace(guid: string, projectId: string, name: string, extra: Partial<WorkspaceModel> = {}): WorkspaceModel {
  return {
    archived_at: null,
    base_branch: "main",
    branch: "main",
    create_source: "manual",
    created_at: "2026-09-22T00:00:00.000Z",
    display_name: name,
    github_issue: null,
    github_pr: null,
    guid,
    is_archived: false,
    is_deleted: false,
    is_pinned: false,
    labels: [],
    last_visited_at: null,
    local_path: "",
    name,
    pin_order: null,
    pinned_at: null,
    priority: "none",
    project_guid: projectId,
    sidebar_order: 0,
    updated_at: "2026-09-22T00:00:00.000Z",
    workflow_status: "todo",
    ...extra,
  };
}

describe("workspace home list", () => {
  const projects = [project("p1", "Atmos")];
  const workspacesByProject = {
    p1: [
      workspace("w1", "p1", "Editor"),
      workspace("w2", "p1", "Nightly", { create_source: "automation" }),
    ],
  };

  test("hides automation workspaces until the filter is on", () => {
    const hidden = visibleWorkspaceEntries({
      filters: EMPTY_WORKSPACE_HOME_FILTERS,
      groups: [],
      projects,
      workspacesByProject,
    });
    expect(hidden.map((entry) => entry.id)).toEqual(["w1"]);

    const shown = visibleWorkspaceEntries({
      filters: { ...EMPTY_WORKSPACE_HOME_FILTERS, showAutomation: true },
      groups: [],
      projects,
      workspacesByProject,
    });
    expect(shown.map((entry) => entry.id).sort()).toEqual(["w1", "w2"]);
  });

  test("keeps the five most recently visited workspaces", () => {
    const many = [1, 2, 3, 4, 5, 6].map((index) =>
      workspace(`w${index}`, "p1", `Item ${index}`, {
        last_visited_at: `2026-09-${String(index).padStart(2, "0")}T00:00:00.000Z`,
      }),
    );
    const entries = visibleWorkspaceEntries({
      filters: { ...EMPTY_WORKSPACE_HOME_FILTERS, showAutomation: true },
      groups: [],
      projects,
      workspacesByProject: { p1: many },
    });
    const recent = recentWorkspaceEntries({
      entries,
      workspacesByProject: { p1: many },
    });
    expect(recent.map((entry) => entry.id)).toEqual(["w6", "w5", "w4", "w3", "w2"]);
  });

  test("places a workspace in its own group ahead of the parent project group", () => {
    const groups: GroupModel[] = [
      {
        guid: "project-group",
        members: [{ guid: "m1", member_guid: "p1", member_type: "project", sort_order: 0 }],
        name: "Project group",
        sidebar_order: 0,
      },
      {
        guid: "workspace-group",
        members: [{ guid: "m2", member_guid: "w1", member_type: "workspace", sort_order: 0 }],
        name: "Workspace group",
        sidebar_order: 1,
      },
    ];
    const entries = visibleWorkspaceEntries({
      filters: { ...EMPTY_WORKSPACE_HOME_FILTERS, groupIds: ["workspace-group"] },
      groups,
      projects,
      workspacesByProject,
    });
    expect(entries.map((entry) => entry.id)).toEqual(["w1"]);

    const sections = groupWorkspaceEntries({
      entries,
      grouping: "group",
      groups,
      projects,
      workspacesByProject,
    });
    expect(sections.map((section) => section.title)).toEqual(["Workspace group"]);
  });

  test("summarizes the selected filter labels", () => {
    expect(filterSelectionLabel([])).toBe("All");
    expect(filterSelectionLabel(["Draft"])).toBe("Draft");
    expect(filterSelectionLabel(["Draft", "Todo", "Blocked"])).toBe("Draft +2");
  });

  test("lists every status and priority even when workspaces have none", () => {
    const statuses = filterChoices({
      groups: [],
      kind: "status",
      projects: [],
      workspacesByProject: {},
    });
    const priorities = filterChoices({
      groups: [],
      kind: "priority",
      projects: [],
      workspacesByProject: {},
    });
    expect(statuses.map((choice) => choice.id)).toEqual(
      WORKSPACE_STATUS_FILTER_OPTIONS.map((option) => option.id),
    );
    expect(priorities.map((choice) => choice.id)).toEqual(
      WORKSPACE_PRIORITY_FILTER_OPTIONS.map((option) => option.id),
    );
  });

  test("groups the visible workspaces by project", () => {
    const entries = visibleWorkspaceEntries({
      filters: EMPTY_WORKSPACE_HOME_FILTERS,
      groups: [],
      projects,
      workspacesByProject,
    });
    const sections = groupWorkspaceEntries({
      entries,
      grouping: "project",
      groups: [],
      projects,
      workspacesByProject,
    });
    expect(sections).toEqual([
      {
        key: "p1",
        title: "Atmos",
        items: [expect.objectContaining({ id: "w1", title: "Editor" })],
      },
    ]);
  });
});
