import { describe, expect, it } from "bun:test";
import type { Project, Workspace } from "@/shared/types/domain";
import { recentObserverChatContexts } from "../observer-recent-contexts";

function workspace(overrides: Partial<Workspace> & Pick<Workspace, "id" | "name">): Workspace {
  return {
    branch: "main",
    baseBranch: "main",
    isActive: false,
    status: "clean",
    projectId: "proj-1",
    isPinned: false,
    isArchived: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    workflowStatus: "in_progress",
    priority: "no_priority",
    labels: [],
    localPath: "/tmp/ws",
    createSource: "manual",
    ...overrides,
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

describe("recentObserverChatContexts", () => {
  it("takes the five most recently visited projects and workspaces", () => {
    const atmos = project({
      id: "proj-atmos",
      name: "atmos",
      lastVisitedAt: "2026-09-21T10:00:00.000Z",
      workspaces: [
        workspace({
          id: "ws-observer",
          name: "observer",
          displayName: "Observer",
          projectId: "proj-atmos",
          lastVisitedAt: "2026-09-21T12:00:00.000Z",
        }),
        workspace({
          id: "ws-old",
          name: "old",
          projectId: "proj-atmos",
          lastVisitedAt: "2026-01-01T00:00:00.000Z",
        }),
        workspace({
          id: "ws-archived",
          name: "archived",
          projectId: "proj-atmos",
          isArchived: true,
          lastVisitedAt: "2026-09-21T13:00:00.000Z",
        }),
      ],
    });
    const mobile = project({
      id: "proj-mobile",
      name: "mobile",
      lastVisitedAt: "2026-09-21T11:00:00.000Z",
    });
    const docs = project({
      id: "proj-docs",
      name: "docs",
      lastVisitedAt: "2026-09-20T09:00:00.000Z",
    });
    const landing = project({
      id: "proj-landing",
      name: "landing",
      lastVisitedAt: "2026-09-19T09:00:00.000Z",
    });
    const cli = project({
      id: "proj-cli",
      name: "cli",
      lastVisitedAt: "2026-09-18T09:00:00.000Z",
    });

    const recents = recentObserverChatContexts([atmos, mobile, docs, landing, cli]);
    expect(recents.map((item) => item.label)).toEqual([
      "Observer / atmos",
      "mobile",
      "atmos",
      "docs",
      "landing",
    ]);
    expect(recents[0]).toMatchObject({
      id: "ws-observer",
      kind: "workspace",
      name: "Observer",
      projectName: "atmos",
    });
    expect(recents.some((item) => item.id === "ws-archived")).toBe(false);
    expect(recents.some((item) => item.id === "ws-old")).toBe(false);
  });
});
