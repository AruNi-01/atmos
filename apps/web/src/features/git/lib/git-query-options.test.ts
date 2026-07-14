import type {
  GitChangedFile,
  GitChangedFilesResponse,
} from "@/api/ws-api-types";
import {
  EMPTY_CHANGED_FILES,
  selectCompareChangedFiles,
} from "./git-changed-files-selection";

function changedFile(path: string): GitChangedFile {
  return {
    path,
    status: "M",
    additions: 1,
    deletions: 0,
    staged: false,
  };
}

function changedFilesResponse(
  compareRef: string | null,
): GitChangedFilesResponse {
  return {
    staged_files: [changedFile("staged.ts")],
    unstaged_files: [changedFile("unstaged.ts")],
    untracked_files: [changedFile("untracked.ts")],
    total_additions: 3,
    total_deletions: 0,
    is_branch_published: true,
    compare_ref: compareRef,
  };
}

describe("selectCompareChangedFiles", () => {
  test("keeps the selection stable for the same compare response", () => {
    const response = changedFilesResponse("origin/main");

    const firstSelection = selectCompareChangedFiles(response);
    const secondSelection = selectCompareChangedFiles(response);

    expect(secondSelection).toBe(firstSelection);
    expect(secondSelection.files).toBe(firstSelection.files);
    expect(secondSelection.files.map((file) => file.path)).toEqual([
      "staged.ts",
      "unstaged.ts",
      "untracked.ts",
    ]);
  });

  test("reuses the empty selection when compare mode is inactive", () => {
    const firstSelection = selectCompareChangedFiles(undefined);
    const secondSelection = selectCompareChangedFiles(
      changedFilesResponse(null),
    );

    expect(secondSelection).toBe(firstSelection);
    expect(secondSelection.files).toBe(EMPTY_CHANGED_FILES);
  });
});
