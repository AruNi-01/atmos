import { beforeEach, describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { ProjectBootstrapSnapshot } from "@/features/project/lib/project-query-options";
import type { Project, Workspace } from "@/shared/types/domain";
import {
  findWorkspaceInSnapshot,
  removeWorkspaceFromSnapshot,
  resolveWorkspaceArchiveRestoreHref,
  restoreWorkspaceToSnapshot,
  WORKSPACE_ARCHIVE_UNDO_SECONDS,
  workspaceArchiveDisplayName,
  workspaceRestoreHref,
} from "../workspace-archive-undo";
import { useWorkspaceArchiveUndoStore } from "../../store/use-workspace-archive-undo-store";

function workspace(overrides: Partial<Workspace> & Pick<Workspace, "id">): Workspace {
  return {
    name: overrides.name ?? overrides.id,
    displayName: overrides.displayName,
    branch: "feat",
    baseBranch: "main",
    isActive: false,
    status: "clean",
    projectId: "proj-1",
    isPinned: false,
    isArchived: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    workflowStatus: "todo",
    priority: "no_priority",
    labels: [],
    localPath: "/tmp/ws",
    createSource: "manual",
    ...overrides,
  };
}

function project(workspaces: Workspace[]): Project {
  return {
    id: "proj-1",
    name: "Atmos",
    isOpen: true,
    workspaces,
    mainFilePath: "/tmp/atmos",
    sidebarOrder: 0,
    borderColor: null,
    logoPath: null,
  };
}

function snapshot(workspaces: Workspace[]): ProjectBootstrapSnapshot {
  return {
    projects: [project(workspaces)],
    workspaceLabels: [],
    groups: [],
  };
}

const undoInitial = useWorkspaceArchiveUndoStore.getInitialState();

describe("workspace archive undo", () => {
  beforeEach(() => {
    useWorkspaceArchiveUndoStore.setState(undoInitial, true);
  });

  it("gives five seconds to undo", () => {
    expect(WORKSPACE_ARCHIVE_UNDO_SECONDS).toBe(5);
    const host = readFileSync(
      join(import.meta.dir, "../../components/WorkspaceArchiveUndoHost.tsx"),
      "utf8",
    );
    expect(host).toContain("duration={WORKSPACE_ARCHIVE_UNDO_SECONDS}");
    expect(host).toContain("UndoPill");
  });

  it("prefers display name and falls back to untitled", () => {
    expect(
      workspaceArchiveDisplayName(
        { name: "feat/ws", displayName: "Launch pad" },
        "Untitled",
      ),
    ).toBe("Launch pad");
    expect(workspaceArchiveDisplayName({ name: "  ", displayName: "" }, "Untitled")).toBe(
      "Untitled",
    );
  });

  it("removes and restores a workspace in the bootstrap snapshot", () => {
    const older = workspace({ id: "ws-old", createdAt: "2026-01-01T00:00:00.000Z" });
    const newer = workspace({ id: "ws-new", createdAt: "2026-04-01T00:00:00.000Z" });
    const current = snapshot([newer, older]);

    expect(findWorkspaceInSnapshot(current, "proj-1", "ws-new")?.id).toBe("ws-new");

    const removed = removeWorkspaceFromSnapshot(current, "proj-1", "ws-new");
    expect(removed.projects[0]?.workspaces.map((item) => item.id)).toEqual(["ws-old"]);

    const restored = restoreWorkspaceToSnapshot(removed, "proj-1", newer);
    expect(restored.projects[0]?.workspaces.map((item) => item.id)).toEqual(["ws-new", "ws-old"]);
    expect(restored.projects[0]?.workspaces[0]?.isArchived).toBe(false);
  });

  it("captures a restore href for the open workspace", () => {
    expect(workspaceRestoreHref("ws-1", "/workspace?id=ws-1&tab=terminal")).toBe(
      "/workspace?id=ws-1",
    );
    expect(workspaceRestoreHref("ws-1", "/workspace/?id=ws-1")).toBe("/workspace?id=ws-1");
    expect(workspaceRestoreHref("ws-1", "/")).toBeNull();
    expect(workspaceRestoreHref("ws-1", "/workspace?id=other")).toBeNull();
    expect(
      resolveWorkspaceArchiveRestoreHref({
        workspaceId: "ws-1",
        wasActive: true,
        href: "/",
      }),
    ).toBe("/workspace?id=ws-1");
  });

  it("replaces and takes a single pending archive", () => {
    const first = {
      projectId: "proj-1",
      workspace: workspace({ id: "ws-1" }),
      restoreHref: "/workspace?id=ws-1",
      wasActive: true,
      scope: { activeInstanceId: "local" as const, connectionEpoch: 1, relaySessionRevision: 0 },
    };
    const second = {
      ...first,
      workspace: workspace({ id: "ws-2" }),
      restoreHref: null,
      wasActive: false,
    };

    expect(useWorkspaceArchiveUndoStore.getState().replacePending(first)).toBeNull();
    expect(useWorkspaceArchiveUndoStore.getState().pending?.workspace.id).toBe("ws-1");
    expect(useWorkspaceArchiveUndoStore.getState().replacePending(second)?.workspace.id).toBe("ws-1");
    expect(useWorkspaceArchiveUndoStore.getState().takePending()?.workspace.id).toBe("ws-2");
    expect(useWorkspaceArchiveUndoStore.getState().pending).toBeNull();
    expect(useWorkspaceArchiveUndoStore.getState().takePending()).toBeNull();
  });
});
