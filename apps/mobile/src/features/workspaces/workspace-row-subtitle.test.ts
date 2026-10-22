// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
import {
  projectGroupProjectSubtitle,
  projectGroupWorkspaceSubtitle,
  recentEntrySubtitle,
} from "./workspace-row-subtitle";

describe("workspace row subtitles", () => {
  test("recent workspace shows its project name", () => {
    expect(recentEntrySubtitle({ kind: "workspace", projectName: "Atmos" })).toBe("Atmos");
    expect(recentEntrySubtitle({ kind: "workspace", projectName: "  Other  " })).toBe("Other");
  });

  test("a project row in Recently says Project", () => {
    expect(recentEntrySubtitle({ kind: "project", projectName: "Atmos" })).toBe("Project");
  });

  test("project-group workspace line shows branch and a positive change count", () => {
    expect(projectGroupWorkspaceSubtitle({ branch: "feat/list", uncommitted: 2 })).toBe(
      "feat/list · +2",
    );
    expect(projectGroupWorkspaceSubtitle({ branch: "feat/list", uncommitted: 0 })).toBe(
      "feat/list",
    );
    expect(projectGroupWorkspaceSubtitle({ branch: "feat/list" })).toBe("feat/list");
    expect(projectGroupWorkspaceSubtitle({ branch: "feat/list", uncommitted: -1 })).toBe(
      "feat/list",
    );
    expect(projectGroupWorkspaceSubtitle({ branch: "  ", uncommitted: 0 })).toBe("No branch");
  });

  test("project-group project line prefers the current branch, then the workspace count", () => {
    expect(projectGroupProjectSubtitle({ currentBranch: "main", workspaceCount: 2 })).toBe(
      "Project · main",
    );
    expect(projectGroupProjectSubtitle({ currentBranch: "  ", workspaceCount: 2 })).toBe(
      "Project · 2 workspaces",
    );
    expect(projectGroupProjectSubtitle({ currentBranch: null, workspaceCount: 1 })).toBe(
      "Project · 1 workspace",
    );
    expect(projectGroupProjectSubtitle({ workspaceCount: 0 })).toBe("Project");
  });
});
