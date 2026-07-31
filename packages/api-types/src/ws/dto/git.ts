/** Shared Git DTOs. Prefer production web wire shapes where clients overlap. */

export type GitStatusResponse = {
  has_uncommitted_changes: boolean;
  has_merge_conflicts: boolean;
  has_unpushed_commits: boolean;
  uncommitted_count: number;
  unpushed_count: number;
  upstream_behind_count: number | null;
  default_branch: string | null;
  default_branch_ahead: number | null;
  default_branch_behind: number | null;
  current_branch: string | null;
  github_owner: string | null;
  github_repo: string | null;
};

export type GitGetStatusBatchResult = {
  path: string;
  status: GitStatusResponse | null;
  error: string | null;
};

export type GitGetStatusBatchResponse = {
  results: GitGetStatusBatchResult[];
};

export type GitChangedFile = {
  path: string;
  status: string;
  additions: number;
  deletions: number;
  is_binary?: boolean;
  staged: boolean;
};

export type GitChangedFilesResponse = {
  staged_files: GitChangedFile[];
  unstaged_files: GitChangedFile[];
  untracked_files: GitChangedFile[];
  total_additions: number;
  total_deletions: number;
  is_branch_published: boolean;
  compare_ref: string | null;
};

export type DiffContentKind = "text" | "binary" | "too_large";
export type DiffPreviewKind = "none" | "image" | "media";

export type GitBlobLocator =
  | { type: "worktree"; path: string }
  | { type: "git"; rev: string; path: string };

/** Production web wire shape for file diffs. */
export type GitFileDiffResponse = {
  file_path: string;
  status: string;
  compare_ref: string | null;
  kind: DiffContentKind;
  preview_kind: DiffPreviewKind;
  old_text: string | null;
  new_text: string | null;
  old_size: number | null;
  new_size: number | null;
  old_sha256: string | null;
  new_sha256: string | null;
  old_blob: GitBlobLocator | null;
  new_blob: GitBlobLocator | null;
};

export type GitFilesDiffResult = {
  file_path: string;
  diff: GitFileDiffResponse | null;
  error: string | null;
};

export type GitFilesDiffResponse = {
  results: GitFilesDiffResult[];
};

export type GitPatchChunkResponse = {
  success: boolean;
  error?: string;
};

export type GitCommitResponse = {
  success: boolean;
  commit_hash: string | null;
};

export type GitGenerateCommitMessageResponse = {
  message: string;
};
