import { describe, expect, it } from "bun:test";
import type { Project } from "@/shared/types/domain";
import {
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

  it("compares working directories without treating empty cwd as different from null", () => {
    expect(
      workingDirectoriesEqual(
        { workspaceId: null, projectId: null, cwd: null },
        { workspaceId: null, projectId: null, cwd: "" },
      ),
    ).toBe(true);
  });
});
