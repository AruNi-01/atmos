import { describe, expect, it } from "bun:test";
import type { Group, Project, Workspace } from "@/shared/types/domain";
import {
  buildUserGroupViews,
  findGroupIdForMember,
  UNGROUPED_USER_GROUP_KEY,
} from "./user-groups";

function workspace(partial: Partial<Workspace> & Pick<Workspace, "id" | "projectId">): Workspace {
  return {
    name: partial.name ?? partial.id,
    branch: "main",
    baseBranch: "main",
    isActive: false,
    status: "clean",
    isPinned: false,
    isArchived: false,
    createdAt: "2026-01-01T00:00:00Z",
    workflowStatus: "todo",
    priority: "no_priority",
    labels: [],
    localPath: `/tmp/${partial.id}`,
    createSource: "manual",
    ...partial,
  };
}

function project(partial: Partial<Project> & Pick<Project, "id" | "name">): Project {
  return {
    isOpen: true,
    workspaces: [],
    mainFilePath: `/tmp/${partial.id}`,
    sidebarOrder: 0,
    borderColor: null,
    logoPath: null,
    ...partial,
  };
}

describe("buildUserGroupViews", () => {
  it("places projects and direct workspaces with dual visibility", () => {
    const wsA = workspace({ id: "w-a", projectId: "p-a", name: "A" });
    const wsB = workspace({ id: "w-b", projectId: "p-b", name: "B" });
    const pA = project({ id: "p-a", name: "Project A", workspaces: [wsA] });
    const pB = project({ id: "p-b", name: "Project B", workspaces: [wsB] });

    const groups: Group[] = [
      {
        id: "g1",
        name: "Client",
        sidebarOrder: 0,
        members: [
          {
            id: "m1",
            memberType: "project",
            memberId: "p-a",
            sortOrder: 0,
          },
          {
            id: "m2",
            memberType: "workspace",
            memberId: "w-b",
            sortOrder: 1,
          },
        ],
      },
    ];

    const views = buildUserGroupViews(groups, [pA, pB], "Ungrouped");
    expect(views).toHaveLength(2);

    const client = views[0];
    expect(client.key).toBe("g1");
    expect(client.projects.map((p) => p.id)).toEqual(["p-a"]);
    // Project A still includes all workspaces (dual visibility under project).
    expect(client.projects[0].workspaces.map((w) => w.id)).toEqual(["w-a"]);
    expect(client.directWorkspaces.map((e) => e.workspace.id)).toEqual(["w-b"]);

    const ungrouped = views[1];
    expect(ungrouped.key).toBe(UNGROUPED_USER_GROUP_KEY);
    expect(ungrouped.projects.map((p) => p.id)).toEqual(["p-b"]);
    // Workspace B still lives under project B in ungrouped project tree.
    expect(ungrouped.projects[0].workspaces.map((w) => w.id)).toEqual(["w-b"]);
  });

  it("finds exclusive membership", () => {
    const groups: Group[] = [
      {
        id: "g1",
        name: "One",
        sidebarOrder: 0,
        members: [
          {
            id: "m1",
            memberType: "project",
            memberId: "p1",
            sortOrder: 0,
          },
        ],
      },
    ];
    expect(findGroupIdForMember(groups, "project", "p1")).toBe("g1");
    expect(findGroupIdForMember(groups, "project", "p2")).toBeNull();
  });

  it("resolves ungrouped members to the ungrouped bucket key", () => {
    // Mirrors use-left-sidebar-workspace-derived currentWorkspaceGroupKey for group mode:
    // missing membership must fall back to UNGROUPED_USER_GROUP_KEY (not null).
    const groups: Group[] = [
      {
        id: "g1",
        name: "Named",
        sidebarOrder: 0,
        members: [
          {
            id: "m1",
            memberType: "project",
            memberId: "p-grouped",
            sortOrder: 0,
          },
        ],
      },
    ];
    const workspaceGroupKey =
      findGroupIdForMember(groups, "workspace", "w-ungrouped") ??
      findGroupIdForMember(groups, "project", "p-ungrouped") ??
      UNGROUPED_USER_GROUP_KEY;
    expect(workspaceGroupKey).toBe(UNGROUPED_USER_GROUP_KEY);

    const groupedKey =
      findGroupIdForMember(groups, "workspace", "w-any") ??
      findGroupIdForMember(groups, "project", "p-grouped") ??
      UNGROUPED_USER_GROUP_KEY;
    expect(groupedKey).toBe("g1");
  });
});
