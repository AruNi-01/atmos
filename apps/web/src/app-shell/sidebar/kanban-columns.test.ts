import { describe, expect, it } from "bun:test";

import {
  buildKanbanBoardColumns,
  isKanbanDragAssignable,
  resolveKanbanColumnKeys,
} from "@/app-shell/sidebar/kanban-columns";
import { NO_STATUS_WORKSPACE_GROUP_KEY } from "@/app-shell/sidebar/workspace-grouping";
import type { Project, Workspace } from "@/shared/types/domain";

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

describe("kanban agent grouping", () => {
  it("builds four agent columns and does not allow drag assignment", () => {
    const columns = buildKanbanBoardColumns({
      groupingMode: "agent",
      projects: [],
      groups: [],
      availableLabels: [],
      ungroupedLabel: "Ungrouped",
      untaggedLabel: "No label",
    });

    expect(columns.map((column) => column.key)).toEqual([
      "permission",
      "attention",
      "running",
      "done",
    ]);
    expect(isKanbanDragAssignable("agent")).toBe(false);
    expect(isKanbanDragAssignable("status")).toBe(true);
  });

  it("resolves a workspace into its agent bucket", () => {
    expect(
      resolveKanbanColumnKeys({
        groupingMode: "agent",
        projectId: "project-1",
        workspace: workspace(),
        groups: [],
        agentGroupKey: "permission",
      }),
    ).toEqual(["permission"]);
    expect(
      resolveKanbanColumnKeys({
        groupingMode: "agent",
        projectId: "project-1",
        workspace: workspace(),
        groups: [],
      }),
    ).toEqual(["done"]);
  });
});

describe("kanban remainder buckets", () => {
  it("adds a No status column when a workspace has no valid status", () => {
    const emptyColumns = buildKanbanBoardColumns({
      groupingMode: "status",
      projects: [],
      groups: [],
      availableLabels: [],
      ungroupedLabel: "Ungrouped",
      untaggedLabel: "No label",
    });
    expect(emptyColumns.map((column) => column.key)).not.toContain(NO_STATUS_WORKSPACE_GROUP_KEY);

    const columns = buildKanbanBoardColumns({
      groupingMode: "status",
      projects: [{
        id: "project-1",
        name: "Project",
        isOpen: true,
        mainFilePath: "/tmp/project",
        sidebarOrder: 0,
        borderColor: null,
        logoPath: null,
        workspaces: [workspace({ workflowStatus: "custom_pipeline" as never })],
      }],
      groups: [],
      availableLabels: [],
      ungroupedLabel: "Ungrouped",
      untaggedLabel: "No label",
    });

    expect(columns.at(-1)).toMatchObject({
      key: NO_STATUS_WORKSPACE_GROUP_KEY,
      label: "status.noStatus",
    });
    expect(
      resolveKanbanColumnKeys({
        groupingMode: "status",
        projectId: "project-1",
        workspace: workspace({ workflowStatus: "custom_pipeline" as never }),
        groups: [],
      }),
    ).toEqual([NO_STATUS_WORKSPACE_GROUP_KEY]);
    expect(
      resolveKanbanColumnKeys({
        groupingMode: "priority",
        projectId: "project-1",
        workspace: workspace({ priority: "critical" as never }),
        groups: [],
      }),
    ).toEqual(["no_priority"]);
  });

  it("creates label columns for workspace-only labels so those cards stay on the board", () => {
    const extraLabel = {
      id: "label-extra",
      name: "Extra",
      color: "#3b82f6",
      source: "manual" as const,
    };
    const project: Project = {
      id: "project-1",
      name: "Project",
      isOpen: true,
      mainFilePath: "/tmp/project",
      sidebarOrder: 0,
      borderColor: null,
      logoPath: null,
      workspaces: [workspace({ labels: [extraLabel] })],
    };
    const columns = buildKanbanBoardColumns({
      groupingMode: "label",
      projects: [project],
      groups: [],
      availableLabels: [],
      ungroupedLabel: "Ungrouped",
      untaggedLabel: "No label",
    });

    expect(columns.map((column) => column.key)).toEqual([
      extraLabel.id,
      "__untagged__",
    ]);
  });
});
