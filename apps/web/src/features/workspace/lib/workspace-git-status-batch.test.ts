import { describe, expect, test } from "bun:test";

import { buildWorkspaceGitStatusFanOut } from "./workspace-git-status-batch";

describe("buildWorkspaceGitStatusFanOut", () => {
  test("deduplicates paths and fans each path out to workspace ids", () => {
    const result = buildWorkspaceGitStatusFanOut([
      { id: "workspace-a", localPath: "/repo/shared" },
      { id: "workspace-b", localPath: "/repo/other" },
      { id: "workspace-c", localPath: "/repo/shared" },
    ]);

    expect(result.paths).toEqual(["/repo/shared", "/repo/other"]);
    expect(result.workspaceIdsByPath.get("/repo/shared")).toEqual([
      "workspace-a",
      "workspace-c",
    ]);
    expect(result.workspaceIdsByPath.get("/repo/other")).toEqual([
      "workspace-b",
    ]);
  });

  test("returns an empty batch for no workspaces", () => {
    const result = buildWorkspaceGitStatusFanOut([]);

    expect(result.paths).toEqual([]);
    expect(result.workspaceIdsByPath.size).toBe(0);
  });
});
