import { describe, expect, test } from "bun:test";
import type { Project, Workspace } from "@/shared/types/domain";
import {
  formatHostSessionTuiCommand,
  formatHostSessionTuiLaunch,
  hostSessionTuiHref,
  matchHostSessionCwd,
  resolveHostSessionTuiTarget,
  shellSingleQuote,
} from "@/features/agent-sessions/lib/host-session-command";

function workspace(
  patch: Pick<Workspace, "id" | "projectId" | "localPath"> & Partial<Workspace>,
): Workspace {
  return {
    name: patch.id,
    branch: "main",
    baseBranch: "main",
    isActive: true,
    status: "clean",
    isPinned: false,
    isArchived: false,
    createdAt: "2026-01-01T00:00:00Z",
    workflowStatus: "todo",
    priority: "no_priority",
    labels: [],
    createSource: "manual",
    ...patch,
  };
}

function project(
  patch: Pick<Project, "id" | "mainFilePath"> & Partial<Project>,
): Project {
  return {
    name: patch.id,
    isOpen: true,
    workspaces: [],
    sidebarOrder: 0,
    borderColor: null,
    logoPath: null,
    ...patch,
  };
}

describe("host session TUI command", () => {
  test("quotes argv and prefixes cd so mosaic shells start at the session cwd", () => {
    expect(formatHostSessionTuiCommand({ bin: "codex", args: ["resume", "abc"] })).toBe(
      "codex resume abc",
    );
    expect(
      formatHostSessionTuiLaunch({
        cwd: "/src/atmos",
        bin: "codex",
        args: ["resume", "abc"],
      }),
    ).toBe("cd '/src/atmos' && 'codex' 'resume' 'abc'");
    expect(
      formatHostSessionTuiLaunch({
        cwd: "Users/aarynlu/OpenSource/atmos",
        bin: "cursor-agent",
        args: ["--resume", "abc"],
      }),
    ).toBe(
      "cd '/Users/aarynlu/OpenSource/atmos' && 'cursor-agent' '--resume' 'abc'",
    );
    expect(shellSingleQuote("it's")).toBe(`'it'\\''s'`);
  });

  test("matches the longest workspace path, then project root", () => {
    const projects = [
      project({
        id: "p-1",
        mainFilePath: "/src/atmos",
        workspaces: [
          workspace({ id: "ws-root", projectId: "p-1", localPath: "/src" }),
          workspace({ id: "ws-atmos", projectId: "p-1", localPath: "/src/atmos" }),
          workspace({
            id: "ws-archived",
            projectId: "p-1",
            localPath: "/src/atmos/crates/agent",
            isArchived: true,
          }),
        ],
      }),
      project({
        id: "p-notes",
        mainFilePath: "/opt/notes",
        workspaces: [],
      }),
    ];

    expect(matchHostSessionCwd("/src/atmos/crates/agent", projects)).toEqual({
      workspaceId: "ws-atmos",
      projectId: "p-1",
    });
    expect(
      matchHostSessionCwd("src/atmos/crates/agent", [
        project({
          id: "p-1",
          mainFilePath: "/src/atmos",
          workspaces: [workspace({ id: "ws-atmos", projectId: "p-1", localPath: "/src/atmos" })],
        }),
      ]),
    ).toEqual({
      workspaceId: "ws-atmos",
      projectId: "p-1",
    });
    expect(matchHostSessionCwd("/opt/notes/today.md", projects)).toEqual({
      workspaceId: null,
      projectId: "p-notes",
    });
    expect(matchHostSessionCwd("/tmp/other", projects)).toEqual({
      workspaceId: null,
      projectId: null,
    });
    expect(matchHostSessionCwd("/src/atmos/", projects).workspaceId).toBe("ws-atmos");
  });

  test("prefers server ids and only falls back to client matching when they are empty", () => {
    const projects = [
      project({
        id: "p-1",
        mainFilePath: "/src/atmos",
        workspaces: [workspace({ id: "ws-atmos", projectId: "p-1", localPath: "/src/atmos" })],
      }),
    ];
    expect(
      resolveHostSessionTuiTarget(
        { workspace_id: "ws-server", project_id: "p-server", cwd: "/src/atmos" },
        projects,
      ),
    ).toEqual({ workspaceId: "ws-server", projectId: "p-server" });
    expect(
      resolveHostSessionTuiTarget({ workspace_id: null, project_id: null, cwd: "/src/atmos" }, projects),
    ).toEqual({ workspaceId: "ws-atmos", projectId: "p-1" });
    expect(hostSessionTuiHref({ workspaceId: "ws-atmos", projectId: "p-1" })).toBe(
      "/workspace?tab=terminal&id=ws-atmos",
    );
    expect(hostSessionTuiHref({ workspaceId: null, projectId: "p-notes" })).toBe(
      "/project?tab=terminal&id=p-notes",
    );
    expect(hostSessionTuiHref({ workspaceId: null, projectId: null })).toBeNull();
  });
});
