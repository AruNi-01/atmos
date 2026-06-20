import type { GitChangedFile, GitChangedFilesResponse } from "@/api/types";

export type ChangedFileGroupId = "staged" | "unstaged" | "untracked";

export type ChangedFileAction = "stage" | "unstage";

export type ChangedFileBuckets = {
  stagedFiles: GitChangedFile[];
  unstagedFiles: GitChangedFile[];
  untrackedFiles: GitChangedFile[];
};

export type ChangedFileGroup = {
  id: ChangedFileGroupId;
  title: string;
  files: GitChangedFile[];
  action: ChangedFileAction;
  actionLabel: string;
};

export function changedFilesFromResponse(response: GitChangedFilesResponse): ChangedFileBuckets {
  return {
    stagedFiles: response.staged_files,
    unstagedFiles: response.unstaged_files,
    untrackedFiles: response.untracked_files,
  };
}

export function countChangedFiles(files: ChangedFileBuckets): number {
  return files.stagedFiles.length + files.unstagedFiles.length + files.untrackedFiles.length;
}

export function buildChangedFileGroups(files: ChangedFileBuckets): ChangedFileGroup[] {
  const groups: ChangedFileGroup[] = [
    {
      id: "staged",
      title: "Staged",
      files: files.stagedFiles,
      action: "unstage",
      actionLabel: "Unstage",
    },
    {
      id: "unstaged",
      title: "Unstaged",
      files: files.unstagedFiles,
      action: "stage",
      actionLabel: "Stage",
    },
    {
      id: "untracked",
      title: "Untracked",
      files: files.untrackedFiles,
      action: "stage",
      actionLabel: "Stage",
    },
  ];

  return groups.filter((group) => group.files.length > 0);
}
