/** Shared FS DTOs (web production shapes; multi-client). */

export type FsEntry = {
  name: string;
  path: string;
  is_dir: boolean;
  is_symlink: boolean;
  is_ignored: boolean;
  symlink_target?: string;
  is_git_repo: boolean;
};

export type FsListDirResponse = {
  path: string;
  parent_path: string | null;
  entries: FsEntry[];
};

export type FsValidateGitPathResponse = {
  is_valid: boolean;
  is_git_repo: boolean;
  suggested_name: string | null;
  default_branch: string | null;
  error: string | null;
};

export type FsReadFileResponse = {
  path: string;
  exists: boolean;
  content: string | null;
  size: number;
  is_symlink: boolean;
};

export type FsReadFilesResult = {
  path: string;
  file: FsReadFileResponse | null;
  error: string | null;
};

export type FsReadFilesResponse = {
  results: FsReadFilesResult[];
};

export type FsWriteFileResponse = {
  path: string;
  success: boolean;
};

export type FsCreateDirResponse = {
  path: string;
  success: boolean;
};

export type FsRenamePathResponse = {
  from: string;
  to: string;
  success: boolean;
};

export type FsDeletePathResponse = {
  path: string;
  success: boolean;
};

export type FsDuplicatePathResponse = {
  from: string;
  to: string;
  success: boolean;
};

export type FileTreeNode = {
  name: string;
  path: string;
  is_dir: boolean;
  is_symlink: boolean;
  is_ignored: boolean;
  symlink_target?: string;
  children?: FileTreeNode[];
};

export type FsListProjectFilesResponse = {
  root_path: string;
  tree: FileTreeNode[];
};

export type SearchMatch = {
  file_path: string;
  line_number: number;
  line_content: string;
  match_start: number;
  match_end: number;
  context_before: string[];
  context_after: string[];
};

export type FsSearchContentResponse = {
  matches: SearchMatch[];
  truncated: boolean;
};

export type FsSearchDirsResponse = {
  entries: FsEntry[];
};

export type FsHomeDirResponse = {
  path: string;
};

export type FsListDirRequest = {
  path: string;
  dirs_only?: boolean;
  show_hidden?: boolean;
  ignore_not_found?: boolean;
};

export type FsValidateGitPathRequest = {
  path: string;
};

export type FsReadFileRequest = {
  path: string;
};

export type FsReadFilesRequest = {
  paths: string[];
};

export type FsWriteFileRequest = {
  path: string;
  content: string;
};

export type FsCreateDirRequest = {
  path: string;
};

export type FsRenamePathRequest = {
  from: string;
  to: string;
};

export type FsDeletePathRequest = {
  path: string;
};

export type FsDuplicatePathRequest = {
  from: string;
  to: string;
};

export type FsListProjectFilesRequest = {
  root_path: string;
  show_hidden?: boolean;
};

export type FsSearchContentRequest = {
  root_path: string;
  query: string;
  max_results?: number;
  case_sensitive?: boolean;
};

export type FsSearchDirsRequest = {
  root_path: string;
  query: string;
  max_results?: number;
  max_depth?: number;
};
