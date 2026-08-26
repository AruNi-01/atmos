import { describe, expect, it } from "bun:test";

import {
  NO_STATUS_WORKSPACE_GROUP_KEY,
  UNTAGGED_WORKSPACE_GROUP_KEY,
  flattenProjects,
  getSidebarEntryKey,
  getWorkspaceLabelGroupKey,
  getWorkspaceStatusGroupKey,
  groupWorkspaces,
  isFlattenedProjectEntry,
  type FlattenedProjectEntry,
  type FlattenedWorkspaceEntry,
} from "@/app-shell/sidebar/workspace-grouping";
import {
  parseSidebarGroupingMode,
  SIDEBAR_GROUPING_OPTIONS,
  WORKSPACE_AGENT_GROUP_OPTIONS,
} from "@/app-shell/sidebar/workspace-status";
import type { Project, Workspace, WorkspaceLabel } from "@/shared/types/domain";

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
    kind: "workspace",
    projectId: value.projectId,
    projectName: "Project",
    projectPath: "/tmp/project",
    workspace: value,
  };
}

function project(overrides: Partial<Project> & Pick<Project, "id" | "name">): Project {
  return {
    isOpen: true,
    workspaces: [],
    mainFilePath: `/tmp/${overrides.id}`,
    sidebarOrder: 0,
    borderColor: null,
    logoPath: null,
    ...overrides,
  };
}

function projectEntry(value: Project): FlattenedProjectEntry {
  return {
    kind: "project",
    projectId: value.id,
    projectName: value.name,
    projectPath: value.mainFilePath,
    project: value,
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

  it("puts missing and unknown workflow statuses in No status without dropping workspaces", () => {
    const inProgress = workspace({ id: "has-status", workflowStatus: "in_progress" });
    const missingStatus = workspace({
      id: "missing-status",
      workflowStatus: undefined as never,
    });
    const unknownStatus = workspace({
      id: "unknown-status",
      workflowStatus: "custom_pipeline" as never,
    });

    const groups = groupWorkspaces(
      [entry(inProgress), entry(missingStatus), entry(unknownStatus)],
      "status",
    );

    expect(groups.map((group) => group.key)).toEqual([
      "backlog",
      "todo",
      "in_progress",
      "in_review",
      "blocked",
      "completed",
      "canceled",
      NO_STATUS_WORKSPACE_GROUP_KEY,
    ]);
    expect(groups.find((group) => group.key === "in_progress")?.items.map((item) => item.workspace.id)).toEqual([
      "has-status",
    ]);
    expect(
      groups.find((group) => group.key === NO_STATUS_WORKSPACE_GROUP_KEY)?.items.map((item) => item.workspace.id),
    ).toEqual(["missing-status", "unknown-status"]);
    expect(getWorkspaceStatusGroupKey(undefined)).toBe(NO_STATUS_WORKSPACE_GROUP_KEY);
    expect(getWorkspaceStatusGroupKey("todo")).toBe("todo");

    const onlyValid = groupWorkspaces([entry(inProgress)], "status");
    expect(onlyValid.map((group) => group.key)).not.toContain(NO_STATUS_WORKSPACE_GROUP_KEY);
  });

  it("mixes project rows into the same status bucket as their latest workspace", () => {
    const latest = workspace({
      id: "ws-latest",
      projectId: "proj-1",
      workflowStatus: "blocked",
      lastVisitedAt: "2026-04-02T00:00:00.000Z",
    });
    const older = workspace({
      id: "ws-older",
      projectId: "proj-1",
      workflowStatus: "todo",
      lastVisitedAt: "2026-04-01T00:00:00.000Z",
    });
    const owner = project({
      id: "proj-1",
      name: "Atmos",
      workspaces: [older, latest],
    });

    const groups = groupWorkspaces(
      [entry(latest), entry(older), projectEntry(owner)],
      "status",
    );
    const blockedIds = groups
      .find((group) => group.key === "blocked")
      ?.items.map((item) => getSidebarEntryKey(item));

    expect(blockedIds).toHaveLength(2);
    expect(blockedIds).toEqual(expect.arrayContaining(["ws-latest", "project:proj-1"]));
    expect(groups.find((group) => group.key === "todo")?.items.map((item) => getSidebarEntryKey(item))).toEqual([
      "ws-older",
    ]);
    expect(flattenProjects([owner]).every(isFlattenedProjectEntry)).toBe(true);
  });

  it("puts an empty project in To Do / No priority / No label instead of dropping it", () => {
    const empty = projectEntry(project({ id: "empty", name: "Empty" }));

    expect(
      groupWorkspaces([empty], "status").find((group) => group.key === "todo")?.items,
    ).toHaveLength(1);
    expect(
      groupWorkspaces([empty], "priority").find((group) => group.key === "no_priority")?.items,
    ).toHaveLength(1);
    expect(
      groupWorkspaces([empty], "label").find((group) => group.key === UNTAGGED_WORKSPACE_GROUP_KEY)?.items,
    ).toHaveLength(1);
    expect(
      groupWorkspaces([empty], "agent").find((group) => group.key === "done")?.items,
    ).toHaveLength(1);
  });

  it("puts unknown priority in No priority so the workspace stays visible", () => {
    const groups = groupWorkspaces(
      [entry(workspace({ id: "unknown-priority", priority: "critical" as never }))],
      "priority",
    );

    expect(groups.find((group) => group.key === "no_priority")?.items.map((item) => item.workspace.id)).toEqual([
      "unknown-priority",
    ]);
  });

  it("still shows workspaces whose labels are not in the saved catalog", () => {
    const orphanLabel: WorkspaceLabel = {
      id: "orphan",
      name: "Orphan",
      color: "#000000",
      source: "manual",
    };
    const groups = groupWorkspaces(
      [entry(workspace({ id: "orphan-labeled", labels: [orphanLabel] }))],
      "label",
      { availableLabels: [labelA], labelGroupOrder: [] },
    );

    expect(groups.find((group) => group.key === "orphan")?.items.map((item) => item.workspace.id)).toEqual([
      "orphan-labeled",
    ]);
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

  it("always emits four agent buckets in action-first order", () => {
    const groups = groupWorkspaces(
      [
        entry(workspace({ id: "needs-permission" })),
        entry(workspace({ id: "done-one" })),
      ],
      "agent",
      {
        agentGroupKeyByWorkspaceId: {
          "needs-permission": "permission",
          "done-one": "done",
        },
      },
    );

    expect(groups.map((group) => group.key)).toEqual([
      "permission",
      "attention",
      "running",
      "done",
    ]);
    expect(groups[0].items.map((item) => item.workspace.id)).toEqual(["needs-permission"]);
    expect(groups[1].items).toEqual([]);
    expect(groups[2].items).toEqual([]);
    expect(groups[3].items.map((item) => item.workspace.id)).toEqual(["done-one"]);
  });

  it("puts unmapped and legacy idle workspaces in done", () => {
    const groups = groupWorkspaces(
      [
        entry(workspace({ id: "never-ran" })),
        entry(workspace({ id: "acked" })),
      ],
      "agent",
      {
        agentGroupKeyByWorkspaceId: {
          acked: "idle" as never,
        },
      },
    );

    expect(groups.find((group) => group.key === "done")?.items.map((item) => item.workspace.id)).toEqual([
      "never-ran",
      "acked",
    ]);
  });

  it("rebuckets a workspace when the agent map changes", () => {
    const running = entry(workspace({ id: "ws-run" }));
    const first = groupWorkspaces([running], "agent", {
      agentGroupKeyByWorkspaceId: { "ws-run": "running" },
    });
    const second = groupWorkspaces([running], "agent", {
      agentGroupKeyByWorkspaceId: { "ws-run": "done" },
    });

    expect(first.find((group) => group.key === "running")?.items).toHaveLength(1);
    expect(second.find((group) => group.key === "running")?.items).toHaveLength(0);
    expect(second.find((group) => group.key === "done")?.items.map((item) => item.workspace.id)).toEqual([
      "ws-run",
    ]);
  });
});

describe("parseSidebarGroupingMode", () => {
  it("accepts agent and falls unknown values back to project", () => {
    expect(SIDEBAR_GROUPING_OPTIONS.some((option) => option.value === "agent")).toBe(true);
    expect(parseSidebarGroupingMode("agent")).toBe("agent");
    expect(parseSidebarGroupingMode("status")).toBe("status");
    expect(parseSidebarGroupingMode("nope")).toBe("project");
    expect(parseSidebarGroupingMode(undefined)).toBe("project");
  });
});

describe("agent group icons", () => {
  it("gives each By Agent Status bucket a distinct icon", () => {
    const icons = WORKSPACE_AGENT_GROUP_OPTIONS.map((option) => option.icon);
    expect(icons).toHaveLength(4);
    expect(new Set(icons).size).toBe(4);
  });
});
