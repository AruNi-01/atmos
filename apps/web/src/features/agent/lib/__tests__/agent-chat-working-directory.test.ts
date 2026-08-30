import { describe, expect, it } from "bun:test";
import type { Project } from "@/shared/types/domain";
import {
  filterProjectWorkspaceFlyout,
  filterWorkingDirectoryMenu,
  agentChatCwdLabel,
  isAgentScratchCwd,
  isThreadWorkingDirectory,
  resolveWorkingDirectoryLabel,
  THREAD_WORKING_DIRECTORY,
  workingDirectoriesEqual,
} from "../agent-chat-working-directory";

const projects = [
  {
    id: "p1",
    name: "Atmos",
    isOpen: true,
    mainFilePath: "/Users/me/atmos",
    sidebarOrder: 0,
    borderColor: null,
    logoPath: null,
    workspaces: [
      {
        id: "ws-1",
        name: "feat-chat",
        displayName: "Feat chat",
        branch: "feat/chat",
        baseBranch: "main",
        isActive: true,
        status: "clean",
        projectId: "p1",
        isPinned: false,
        isArchived: false,
        createdAt: "",
        workflowStatus: "todo",
        priority: "no_priority",
        labels: [],
        localPath: "/Users/me/atmos-feat",
        createSource: "manual",
      },
    ],
  },
] as unknown as Project[];

describe("agent chat working directory", () => {
  it("labels the agent scratch directory as Thread", () => {
    expect(isAgentScratchCwd("/Users/me/.atmos/data/agent/scratch")).toBe(true);
    expect(isAgentScratchCwd("C:\\Users\\me\\.atmos\\data\\agent\\scratch\\")).toBe(true);
    expect(isAgentScratchCwd("/tmp/app")).toBe(false);
    expect(agentChatCwdLabel("/Users/me/.atmos/data/agent/scratch", "Thread")).toBe("Thread");
    expect(agentChatCwdLabel("/tmp/app", "Thread")).toBe("/tmp/app");
  });

  it("treats empty ids as thread mode", () => {
    expect(isThreadWorkingDirectory(THREAD_WORKING_DIRECTORY)).toBe(true);
    expect(
      isThreadWorkingDirectory({ workspaceId: null, projectId: "p1", cwd: "/tmp" }),
    ).toBe(false);
  });

  it("labels thread, project, and workspace selections", () => {
    expect(resolveWorkingDirectoryLabel(THREAD_WORKING_DIRECTORY, projects, "Thread")).toBe(
      "Thread",
    );
    expect(
      resolveWorkingDirectoryLabel(
        { workspaceId: null, projectId: "p1", cwd: "/Users/me/atmos" },
        projects,
        "Thread",
      ),
    ).toBe("Atmos");
    expect(
      resolveWorkingDirectoryLabel(
        { workspaceId: "ws-1", projectId: "p1", cwd: "/Users/me/atmos-feat" },
        projects,
        "Thread",
      ),
    ).toBe("Feat chat");
  });

  it("filters thread, projects, and nested workspaces from search", () => {
    expect(filterWorkingDirectoryMenu(projects, "", "Thread")).toEqual({
      showThread: true,
      projects: [
        {
          project: projects[0],
          workspaces: projects[0].workspaces,
        },
      ],
    });
    expect(filterWorkingDirectoryMenu(projects, "thread", "Thread").showThread).toBe(true);
    expect(filterWorkingDirectoryMenu(projects, "atmos", "Thread").showThread).toBe(false);
    expect(filterWorkingDirectoryMenu(projects, "feat", "Thread").projects[0]?.workspaces).toHaveLength(1);
    expect(filterWorkingDirectoryMenu(projects, "missing", "Thread")).toEqual({
      showThread: false,
      projects: [],
    });
  });

  it("filters a project's workspace flyout independently", () => {
    const workspaces = projects[0].workspaces;
    expect(filterProjectWorkspaceFlyout("Atmos", workspaces, "")).toEqual({
      showProject: true,
      workspaces,
    });
    expect(filterProjectWorkspaceFlyout("Atmos", workspaces, "atmos").showProject).toBe(true);
    expect(filterProjectWorkspaceFlyout("Atmos", workspaces, "feat").showProject).toBe(false);
    expect(filterProjectWorkspaceFlyout("Atmos", workspaces, "feat").workspaces).toHaveLength(1);
    expect(filterProjectWorkspaceFlyout("Atmos", workspaces, "missing")).toEqual({
      showProject: false,
      workspaces: [],
    });
  });

  it("compares working directories without treating empty cwd as different from null", () => {
    expect(
      workingDirectoriesEqual(
        { workspaceId: null, projectId: null, cwd: null },
        { workspaceId: null, projectId: null, cwd: "" },
      ),
    ).toBe(true);
  });
});
