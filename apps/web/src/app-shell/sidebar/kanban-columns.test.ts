import { describe, expect, it } from "bun:test";

import {
  buildKanbanBoardColumns,
  isKanbanDragAssignable,
  resolveKanbanColumnKeys,
} from "@/app-shell/sidebar/kanban-columns";
import type { Workspace } from "@/shared/types/domain";

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
      "idle",
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
    ).toEqual(["idle"]);
  });
});
