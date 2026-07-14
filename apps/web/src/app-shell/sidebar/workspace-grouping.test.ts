import { describe, expect, it } from "bun:test";

import {
  UNTAGGED_WORKSPACE_GROUP_KEY,
  getWorkspaceLabelGroupKey,
  groupWorkspaces,
  type FlattenedWorkspaceEntry,
} from "@/app-shell/sidebar/workspace-grouping";
import type { Workspace, WorkspaceLabel } from "@/shared/types/domain";

const labelA: WorkspaceLabel = {
  id: "label-a",
  name: "Frontend",
  color: "#3b82f6",
  source: "manual",
};

const labelB: WorkspaceLabel = {
  id: "label-b",
  name: "Backend",
  color: "#22c55e",
  source: "manual",
};

const labelC: WorkspaceLabel = {
  id: "label-c",
  name: "Documentation",
  color: "#a855f7",
  source: "manual",
};

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

function entry(value: Workspace): FlattenedWorkspaceEntry {
  return {
    projectId: value.projectId,
    projectName: "Project",
    projectPath: "/tmp/project",
    workspace: value,
  };
}

describe("groupWorkspaces", () => {
  it("orders label groups, duplicates multi-label workspaces, and keeps untagged workspaces", () => {
    const multiLabelWorkspace = workspace({
      id: "multi-label",
      labels: [labelA, labelB],
      createdAt: "2026-01-03T00:00:00.000Z",
    });
    const untaggedWorkspace = workspace({
      id: "untagged",
      createdAt: "2026-01-02T00:00:00.000Z",
    });

    const groups = groupWorkspaces(
      [entry(multiLabelWorkspace), entry(untaggedWorkspace)],
      "label",
      {
        availableLabels: [labelA, labelB, labelC],
        labelGroupOrder: [labelB.id, labelA.id],
      },
    );

    expect(groups.map((group) => group.key)).toEqual([
      labelB.id,
      labelA.id,
      labelC.id,
      UNTAGGED_WORKSPACE_GROUP_KEY,
    ]);
    expect(groups[0].items.map((item) => item.workspace.id)).toEqual(["multi-label"]);
    expect(groups[1].items.map((item) => item.workspace.id)).toEqual(["multi-label"]);
    expect(groups[2].items).toEqual([]);
    expect(groups[3].items.map((item) => item.workspace.id)).toEqual(["untagged"]);
  });

  it("orders priority groups from urgent to no priority", () => {
    const groups = groupWorkspaces(
      [
        entry(workspace({ id: "low", priority: "low" })),
        entry(workspace({ id: "urgent", priority: "urgent" })),
      ],
      "priority",
    );

    expect(groups.map((group) => group.key)).toEqual([
      "urgent",
      "high",
      "medium",
      "low",
      "no_priority",
    ]);
    expect(groups[0].items.map((item) => item.workspace.id)).toEqual(["urgent"]);
    expect(groups[3].items.map((item) => item.workspace.id)).toEqual(["low"]);
  });

  it("uses the available label order when a workspace's labels have no saved order", () => {
    const multiLabelWorkspace = workspace({
      labels: [labelB, labelA],
    });

    expect(
      getWorkspaceLabelGroupKey(
        multiLabelWorkspace,
        [],
        [labelA, labelB],
      ),
    ).toBe(labelA.id);
    expect(
      getWorkspaceLabelGroupKey(
        multiLabelWorkspace,
        [labelB.id],
        [labelA, labelB],
      ),
    ).toBe(labelB.id);
  });
});
