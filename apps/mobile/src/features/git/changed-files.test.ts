// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
import type { GitChangedFile, GitChangedFilesResponse } from "@/api/types";
import { buildChangedFileGroups, changedFilesFromResponse, countChangedFiles } from "./changed-files";

function file(path: string, status: string, staged = false): GitChangedFile {
  return {
    path,
    status,
    staged,
    additions: 2,
    deletions: 1,
  };
}

describe("changed files view model", () => {
  test("keeps staged, unstaged, and untracked files in mobile display order", () => {
    const groups = buildChangedFileGroups({
      stagedFiles: [file("src/ready.ts", "modified", true)],
      unstagedFiles: [file("src/work.ts", "modified")],
      untrackedFiles: [file("src/new.ts", "untracked")],
    });

    expect(groups.map((group) => group.id)).toEqual(["staged", "unstaged", "untracked"]);
    expect(groups.map((group) => group.title)).toEqual(["Staged", "Unstaged", "Untracked"]);
    expect(groups.map((group) => group.action)).toEqual(["unstage", "stage", "stage"]);
    expect(groups.map((group) => group.files[0]?.path)).toEqual(["src/ready.ts", "src/work.ts", "src/new.ts"]);
  });

  test("omits empty groups but still counts every changed file", () => {
    const files = {
      stagedFiles: [],
      unstagedFiles: [file("src/work.ts", "modified"), file("src/theme.ts", "deleted")],
      untrackedFiles: [],
    };

    expect(countChangedFiles(files)).toBe(2);
    expect(buildChangedFileGroups(files).map((group) => group.id)).toEqual(["unstaged"]);
  });

  test("normalizes the relay changed-files response into mobile buckets", () => {
    const response: GitChangedFilesResponse = {
      staged_files: [file("staged.ts", "modified", true)],
      unstaged_files: [file("unstaged.ts", "modified")],
      untracked_files: [file("new.ts", "untracked")],
      total_additions: 6,
      total_deletions: 3,
      is_branch_published: true,
      compare_ref: "main",
    };

    expect(changedFilesFromResponse(response)).toEqual({
      stagedFiles: response.staged_files,
      unstagedFiles: response.unstaged_files,
      untrackedFiles: response.untracked_files,
    });
  });
});
