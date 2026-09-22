import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { AgentSessionStatusSnapshot } from "@atmos/api-types/ws/dto/agent-status";
import { resolveWorkspaceAgentGroupKey } from "@/features/agent/lib/workspace-agent-status";
import { parseSidebarListView } from "@/app-shell/sidebar/sidebar-list-view";
import type { Project, Workspace } from "@/shared/types/domain";
import {
  buildSidebarSessionRows,
  formatSessionRowSubtitle,
  groupSidebarSessions,
} from "@/app-shell/sidebar/session-grouping";

function workspace(overrides: Partial<Workspace> = {}): Workspace {
  return {
    id: overrides.id ?? "workspace-1",
    name: overrides.name ?? "Feature",
    branch: overrides.branch ?? "feat",
    baseBranch: "main",
    isActive: false,
    status: "clean",
    projectId: overrides.projectId ?? "project-1",
    isPinned: false,
    isArchived: overrides.isArchived ?? false,
    createdAt: "2026-01-01T00:00:00.000Z",
    workflowStatus: overrides.workflowStatus ?? "in_progress",
    priority: overrides.priority ?? "no_priority",
    labels: overrides.labels ?? [],
    localPath: "/tmp/atmos/feature",
    createSource: "manual",
    ...overrides,
  };
}

function project(workspaces: Workspace[]): Project {
  return {
    id: "project-1",
    name: "Atmos",
    isOpen: true,
    workspaces,
    mainFilePath: "/tmp/atmos",
    sidebarOrder: 0,
    borderColor: null,
    logoPath: null,
  };
}

function snapshot(
  overrides: Partial<AgentSessionStatusSnapshot> & Pick<AgentSessionStatusSnapshot, "session_id" | "surface" | "group_key">,
): AgentSessionStatusSnapshot {
  return {
    context_id: "workspace-1",
    surface_id: null,
    tool: null,
    updated_at: "2026-09-22T12:00:00.000Z",
    project_path: "/tmp/atmos",
    ...overrides,
  };
}

describe("sidebar session view", () => {
  test("missing view parses as workspace", () => {
    expect(parseSidebarListView(undefined)).toBe("workspace");
    expect(parseSidebarListView(null)).toBe("workspace");
    expect(parseSidebarListView("nope")).toBe("workspace");
    expect(parseSidebarListView("session")).toBe("session");
    const settings = readFileSync(
      join(import.meta.dir, "../left-sidebar-settings.ts"),
      "utf8",
    );
    expect(settings).toContain("parseSidebarListView(settings.workspace_sidebar?.view)");
    expect(settings).not.toContain("workspace_kanban_view?.view");
  });

  test("two terminals and one chat become three rows", () => {
    const active = workspace();
    const archived = workspace({
      id: "workspace-archived",
      name: "Old",
      isArchived: true,
    });
    const rows = buildSidebarSessionRows({
      projects: [project([active, archived])],
      chatTitles: { "chat-1": "Fix login" },
      snapshots: [
        snapshot({
          session_id: "workspace-1:alpha",
          surface: "terminal",
          group_key: "running",
        }),
        snapshot({
          session_id: "workspace-1:beta",
          surface: "terminal",
          group_key: "permission",
          updated_at: "2026-09-22T11:00:00.000Z",
        }),
        snapshot({
          session_id: "chat:chat-1",
          surface: "chat",
          surface_id: "chat-1",
          tool: "codex",
          group_key: "done",
        }),
        snapshot({
          session_id: "workspace-archived:gone",
          context_id: "workspace-archived",
          surface: "terminal",
          group_key: "done",
        }),
      ],
    });

    expect(rows).toHaveLength(3);
    expect(rows.filter((row) => row.surface === "terminal")).toHaveLength(2);
    expect(rows.filter((row) => row.surface === "chat")).toHaveLength(1);
    expect(rows.map((row) => row.title)).toEqual(["alpha", "beta", "Fix login"]);
    expect(rows.some((row) => row.sessionId.includes("gone"))).toBe(false);
  });

  test("agent group-by uses each session bucket", () => {
    const ws = workspace();
    const rows = buildSidebarSessionRows({
      projects: [project([ws])],
      snapshots: [
        snapshot({
          session_id: "workspace-1:run",
          surface: "terminal",
          group_key: "running",
        }),
        snapshot({
          session_id: "workspace-1:ask",
          surface: "terminal",
          group_key: "permission",
        }),
      ],
    });
    const sessionGroups = groupSidebarSessions(rows, "agent");
    expect(sessionGroups.map((group) => group.key)).toEqual(["permission", "running"]);
    expect(sessionGroups.every((group) => group.items.length === 1)).toBe(true);

    // Workspace By Agent Status still rolls both panes into permission.
    expect(resolveWorkspaceAgentGroupKey({
      agentState: "running",
      attentionReason: "permission_request",
    })).toBe("permission");
    expect(resolveWorkspaceAgentGroupKey({
      agentState: "permission_request",
      attentionReason: null,
    })).toBe("permission");
  });

  test("subtitle omits empty segments", () => {
    expect(formatSessionRowSubtitle({
      projectName: "Atmos",
      workspaceName: "Feature",
      branch: "feat",
      prState: "Open",
    })).toBe("Atmos · Feature · feat · Open");
    expect(formatSessionRowSubtitle({
      projectName: "Atmos",
      workspaceName: "  ",
      branch: null,
      prState: "Open",
    })).toBe("Atmos · Open");
    expect(formatSessionRowSubtitle({
      projectName: "",
      workspaceName: null,
      branch: "",
      prState: null,
    })).toBe("");
  });

  test("kanban filter menu is not given the sidebar view switch", () => {
    const kanban = readFileSync(join(import.meta.dir, "WorkspaceKanbanView.tsx"), "utf8");
    const tasks = readFileSync(
      join(import.meta.dir, "../../features/task/components/TaskManagementView.tsx"),
      "utf8",
    );
    const footer = readFileSync(
      join(import.meta.dir, "../left-sidebar-tab-footer-controls.tsx"),
      "utf8",
    );
    expect(kanban).not.toContain("showView");
    expect(tasks).not.toContain("showView");
    expect(footer).toContain("showView");
  });
});
