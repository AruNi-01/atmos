import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveAgentChatSkillsContext } from "@/features/agent/lib/agent-chat-skills-context";
import type { Project } from "@/shared/types/domain";

const source = readFileSync(
  join(import.meta.dir, "../use-agent-composer-popovers.tsx"),
  "utf8",
);

function project(partial: Partial<Project> & Pick<Project, "id" | "name">): Project {
  return {
    isOpen: true,
    workspaces: [],
    mainFilePath: "/repo",
    sidebarOrder: 0,
    borderColor: null,
    logoPath: null,
    ...partial,
  };
}

describe("agent composer atmos slash commands", () => {
  it("wires Welcome built-in commands, not only Simulator Device Use", () => {
    expect(source).toContain("buildBrowserUseSlashCommand");
    expect(source).toContain("buildDesktopUseSlashCommand");
    expect(source).toContain("buildViewRunLogsSlashCommand");
    expect(source).toContain("buildDevicePreviewSlashCommand");
    expect(source).toContain('id: "dynamic-skills"');
    expect(source).toContain("applySkillDisableCommandAtRange");
    expect(source).toContain("restoreSlashFromSkillDisable");
    expect(source).toContain("beginSkillDisableChipDismiss");
    expect(source).toContain("focusSkillDisableFilter");
    expect(source).toContain("setSkillDisableSessionActions");
    expect(source).toContain("skillDisableSessionOpen");
    expect(source).toContain("gateDesktopUseFeature");
    expect(source).toContain("resolveViewRunLogsPromptText");
    expect(source).not.toContain('id: "side"');
    expect(source).not.toContain('id: "spawn"');
  });

  it("prefers workspace skills context when the chat is bound to a workspace", () => {
    const workspaceProject = project({
      id: "proj-1",
      name: "Repo",
      workspaces: [
        {
          id: "ws-1",
          name: "feature",
          displayName: "Feature branch",
          branch: "feature",
          baseBranch: "main",
          isActive: true,
          status: "clean",
          projectId: "proj-1",
          isPinned: false,
          isArchived: false,
          createdAt: "",
          workflowStatus: "todo",
          priority: "no_priority",
          labels: [],
          localPath: "/repo/workspaces/feature",
          createSource: "manual",
        },
      ],
    });
    expect(
      resolveAgentChatSkillsContext({
        activeProjectId: "proj-1",
        sessionWorkspaceId: "ws-1",
        projectPath: "/repo/workspaces/feature",
        projects: [workspaceProject],
      }),
    ).toEqual({
      mode: "workspace",
      id: "ws-1",
      name: "Feature branch",
      path: "/repo/workspaces/feature",
    });
    expect(
      resolveAgentChatSkillsContext({
        activeProjectId: "proj-1",
        sessionWorkspaceId: "ws-1",
        projectPath: "/tmp/cwd-mismatch",
        projects: [workspaceProject],
      })?.path,
    ).toBe("/repo/workspaces/feature");
  });

  it("falls back to project skills context when there is no workspace", () => {
    expect(
      resolveAgentChatSkillsContext({
        activeProjectId: "proj-1",
        sessionWorkspaceId: null,
        projectPath: "/repo",
        projects: [project({ id: "proj-1", name: "Repo" })],
      }),
    ).toEqual({
      mode: "project",
      id: "proj-1",
      name: "Repo",
      path: "/repo",
    });
  });

  it("hides Dynamic Skills when the chat has no cwd", () => {
    expect(
      resolveAgentChatSkillsContext({
        activeProjectId: "proj-1",
        sessionWorkspaceId: "ws-1",
        projectPath: null,
        projects: [],
      }),
    ).toBeNull();
  });
});
