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

export type GitHistoryRefKind = "branch" | "remote" | "tag";

export type GitHistoryRef = {
  kind: GitHistoryRefKind;
  label: string;
};

export type GitHistoryCommit = {
  hash: string;
  short_hash: string;
  parent_hashes: string[];
  subject: string;
  author_name: string;
  author_email: string;
  timestamp: number;
  refs: GitHistoryRef[];
};

export type GitHistoryPage = {
  commits: GitHistoryCommit[];
  head_sha: string | null;
  next_cursor: number | null;
  total_count: number | null;
  head_commit_count: number | null;
};

export type GitGetStatusRequest = {
  path: string;
};

export type GitGetStatusBatchRequest = {
  paths: string[];
};

export type GitGetHeadCommitRequest = {
  path: string;
};

export type GitGetHeadCommitResponse = {
  commit_hash: string;
};

export type GitGetCommitCountRequest = {
  path: string;
  base_commit: string;
  head_commit: string;
};

export type GitGetCommitCountResponse = {
  count: number;
};

export type GitListBranchesRequest = {
  path: string;
};

export type GitBranchesResponse = {
  branches: string[];
};

export type GitRenameBranchRequest = {
  path: string;
  old_name: string;
  new_name: string;
};

export type GitChangedFilesRequest = {
  path: string;
  base_branch?: string | null;
  base_ref?: string | null;
  commit_ref?: string | null;
  use_preferred_compare?: boolean;
};

export type GitFileDiffRequest = {
  path: string;
  file_path: string;
  base_branch?: string | null;
  base_ref?: string | null;
  commit_ref?: string | null;
  against_index?: boolean;
};

export type GitFilesDiffRequest = {
  path: string;
  file_paths: string[];
  base_branch?: string | null;
  base_ref?: string | null;
  commit_ref?: string | null;
  against_index?: boolean;
};

export type GitPatchChunkRequest = {
  path: string;
  file_path: string;
  patch: string;
  file_status: string;
};

export type GitCommitRequest = {
  path: string;
  message: string;
};

export type GitGenerateCommitMessageRequest = {
  path: string;
};

export type GitPathFilesRequest = {
  path: string;
  files: string[];
};

export type GitPathRequest = {
  path: string;
};

export type GitLogRequest = {
  path: string;
  limit?: number;
  offset?: number;
};

export type GitLogCommit = {
  hash: string;
  short_hash: string;
  author_name: string;
  author_email: string;
  timestamp: number;
  subject: string;
  body: string | null;
  is_pushed: boolean;
  author_avatar_url: string | null;
};

export type GitLogPage = {
  commits: GitLogCommit[];
};

export type GitHistoryRequest = {
  path: string;
  limit?: number;
  cursor?: number;
};
