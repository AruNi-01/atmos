import type { GithubIssuePayload, GithubPrPayload } from "@/api/ws/github-api";

// 文件系统类型
export interface FsEntry {
  name: string;
  path: string;
  is_dir: boolean;
  is_symlink: boolean;
  is_ignored: boolean;
  symlink_target?: string;
  is_git_repo: boolean;
}

export interface FsListDirResponse {
  path: string;
  parent_path: string | null;
  entries: FsEntry[];
}

export interface FsValidateGitPathResponse {
  is_valid: boolean;
  is_git_repo: boolean;
  suggested_name: string | null;
  default_branch: string | null;
  error: string | null;
}

// 文件读写类型
export interface FsReadFileResponse {
  path: string;
  exists: boolean;
  content: string | null;
  size: number;
  is_symlink: boolean;
}

export interface FsWriteFileResponse {
  path: string;
  success: boolean;
}

export interface FsCreateDirResponse {
  path: string;
  success: boolean;
}

export interface FsRenamePathResponse {
  from: string;
  to: string;
  success: boolean;
}

export interface FsDeletePathResponse {
  path: string;
  success: boolean;
}

export interface FsDuplicatePathResponse {
  from: string;
  to: string;
  success: boolean;
}

// 文件树类型
export interface FileTreeNode {
  name: string;
  path: string;
  is_dir: boolean;
  is_symlink: boolean;
  is_ignored: boolean;
  symlink_target?: string;
  children?: FileTreeNode[];
}

export interface FsListProjectFilesResponse {
  root_path: string;
  tree: FileTreeNode[];
}

// 搜索类型
export interface SearchMatch {
  file_path: string;
  line_number: number;
  line_content: string;
  match_start: number;
  match_end: number;
  context_before: string[];
  context_after: string[];
}

export interface FsSearchContentResponse {
  matches: SearchMatch[];
  truncated: boolean;
}

export interface FsSearchDirsResponse {
  entries: FsEntry[];
}

// Project 类型（后端返回格式）
export interface ProjectModel {
  guid: string;
  name: string;
  main_file_path: string;
  sidebar_order: number;
  border_color: string | null;
  logo_path: string | null;
  target_branch: string | null;
  created_at: string;
  updated_at: string;
  is_deleted: boolean;
}

// Git 状态响应
export interface GitStatusResponse {
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
}

// 变更文件信息
export interface GitChangedFile {
  path: string;
  status: string; // M, A, D, R, C, U, ?
  additions: number;
  deletions: number;
  staged: boolean;
}

// 变更文件列表响应
export interface GitChangedFilesResponse {
  staged_files: GitChangedFile[];
  unstaged_files: GitChangedFile[];
  untracked_files: GitChangedFile[];
  total_additions: number;
  total_deletions: number;
  is_branch_published: boolean;
  compare_ref: string | null;
}

// 文件 diff 响应
export interface GitFileDiffResponse {
  file_path: string;
  old_content: string;
  new_content: string;
  status: string;
  compare_ref: string | null;
}

export interface GitPatchChunkResponse {
  success: boolean;
  error?: string;
}

// Git 提交响应
export interface GitCommitResponse {
  success: boolean;
  commit_hash: string | null;
}

export interface GitGenerateCommitMessageResponse {
  message: string;
}

// Archived Workspace 类型
export interface ArchivedWorkspace {
  guid: string;
  name: string;
  display_name?: string | null;
  branch: string;
  base_branch: string;
  project_guid: string;
  project_name: string;
  archived_at: string;
}

// Workspace 类型（后端返回格式）
export interface WorkspaceModel {
  guid: string;
  project_guid: string;
  name: string;
  display_name: string | null;
  branch: string;
  base_branch: string;
  sidebar_order: number;
  created_at: string;
  updated_at: string;
  is_deleted: boolean;
  is_pinned: boolean;
  pinned_at: string | null;
  pin_order: number | null;
  is_archived: boolean;
  archived_at: string | null;
  last_visited_at: string | null;
  workflow_status: string;
  priority: string;
  local_path: string;
  github_issue: GithubIssuePayload | null;
  github_pr: GithubPrPayload | null;
  labels: WorkspaceLabelModel[];
  create_source: string;
}

export interface WorkspaceAttachmentPayload {
  filename: string;
  mime: string;
  dataBase64: string;
}

export interface WorkspaceImportGithubIssuesResult {
  created: WorkspaceModel[];
  skipped: Array<{
    issue_url: string;
    reason: string;
  }>;
}

export interface WorkspaceLabelModel {
  guid: string;
  name: string;
  color: string;
  created_at?: string;
  source: string;
}

export interface AppOpenResponse {
  success: boolean;
  app_name: string;
  path: string;
}

export interface CanvasBoardResponse {
  guid: string;
  slug: string;
  name: string;
  document_json: string;
  updated_at: string;
}

export interface CanvasBridgeRegisterPayload {
  client_id: string;
  label?: string;
  accepts_commands?: boolean;
  capabilities?: string[];
}

export interface CanvasAgentDispatchResultPayload {
  request_id: string;
  success: boolean;
  error_code?: string;
  error_message?: string;
  recoverable?: boolean;
  data?: unknown;
}
