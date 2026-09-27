// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
import { resolveChatScope, type ChatScopeBootstrap } from "./scope";

const bootstrap: ChatScopeBootstrap = {
  projects: [
    { guid: "project-1", main_file_path: "/repo" },
    { guid: "same-id", main_file_path: "/project-path" },
  ],
  workspaces_by_project: {
    "project-1": [{ guid: "workspace-1", local_path: "/repo/worktree" }],
    "same-id": [{ guid: "same-id", local_path: "/repo/workspace" }],
  },
};

describe("resolveChatScope", () => {
  test("workspace id uses workspace_id and the workspace path", () => {
    expect(resolveChatScope(bootstrap, "workspace-1")).toEqual({
      ok: true,
      scope: { workspace_id: "workspace-1" },
      cwd: "/repo/worktree",
    });
  });

  test("project id uses project_id when it is not a workspace", () => {
    expect(resolveChatScope(bootstrap, "project-1")).toEqual({
      ok: true,
      scope: { project_id: "project-1" },
      cwd: "/repo",
    });
  });

  test("a workspace match wins when the same id is also a project", () => {
    expect(resolveChatScope(bootstrap, "same-id")).toEqual({
      ok: true,
      scope: { workspace_id: "same-id" },
      cwd: "/repo/workspace",
    });
  });

  test("unknown id is an error and does not guess a scope", () => {
    expect(resolveChatScope(bootstrap, "missing")).toEqual({
      ok: false,
      error: "No workspace or project matches this id.",
    });
    expect(resolveChatScope(null, "workspace-1").ok).toBe(false);
    expect(resolveChatScope(bootstrap, "  ").ok).toBe(false);
  });
});
