export type ApiEnvelope<T> = {
  success?: boolean;
  data?: T;
  message?: string | null;
  error?: string | null;
};

export type ComputerRow = {
  server_id: string;
  display_name: string | null;
  revoked: number;
  created_at: number;
  last_seen_at: number | null;
  registration_meta: Record<string, unknown> | null;
  online: boolean;
};

export type ClientSessionResponse = {
  client_token: string;
  expires_at: number;
  ws_url: string;
  gateway_url: string;
  terminal_ws_url: string;
};

export type RegisterTokenResponse = {
  register_token: string;
  expires_at: number;
  register_command: string;
};

export type FsEntry = {
  name: string;
  path: string;
  is_dir: boolean;
  is_symlink: boolean;
  is_ignored: boolean;
  symlink_target?: string | null;
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

export type ProjectModel = {
  guid: string;
  name: string;
  main_file_path: string;
  sidebar_order: number;
  border_color: string | null;
  logo_path?: string | null;
  target_branch?: string | null;
  created_at: string;
  updated_at: string;
  is_deleted: boolean;
};

export type GithubIssueLabelPayload = {
  name: string;
  color: string | null;
  description: string | null;
};

export type GithubIssuePayload = {
  owner: string;
  repo: string;
  number: number;
  title: string;
  body: string | null;
  url: string;
  state: string;
  created_at?: string;
  updated_at?: string;
  labels: GithubIssueLabelPayload[];
};

export type GithubPrPayload = {
  owner: string;
  repo: string;
  number: number;
  title: string;
  body: string | null;
  url: string;
  state: string;
  head_ref: string;
  base_ref: string;
  is_draft: boolean;
  labels: GithubIssueLabelPayload[];
};

export type WorkspaceLabelModel = {
  guid: string;
  name: string;
  color: string;
  source: string;
  created_at?: string;
};

export type WorkspaceModel = {
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
};

export type GroupMemberModel = {
  guid: string;
  member_type: string;
  member_guid: string;
  sort_order: number;
};

export type GroupModel = {
  guid: string;
  name: string;
  sidebar_order: number;
  members: GroupMemberModel[];
};

export type ProjectWorkspaceBootstrapResponse = {
  projects: ProjectModel[];
  workspace_labels: WorkspaceLabelModel[];
  workspaces_by_project: Record<string, WorkspaceModel[]>;
  groups?: GroupModel[];
};

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

export type GitChangedFile = {
  path: string;
  status: string;
  additions: number;
  deletions: number;
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

export type GitFileDiffResponse = {
  file_path: string;
  old_content: string;
  new_content: string;
  status: string;
  compare_ref: string | null;
};

export type GitCommitResponse = {
  success: boolean;
  commit_hash: string | null;
};

export type TerminalWorkspaceCandidate = {
  id: string;
  workspace_id: string;
  label: string;
  session_id?: string | null;
  tmux_session?: string | null;
  tmux_window_name?: string | null;
  tmux_window_index?: number | null;
  session_type?: string | null;
  project_name?: string | null;
  workspace_name?: string | null;
  terminal_name?: string | null;
  cwd?: string | null;
  active: boolean;
};

export type TerminalWorkspaceCandidatesResponse = {
  candidates: TerminalWorkspaceCandidate[];
};

export type WsRequestPayload = {
  request_id: string;
  action: string;
  data?: unknown;
};

export type WsRequest = {
  type: "request";
  payload: WsRequestPayload;
};

export type WsResponse<T = unknown> = {
  type: "response";
  payload: {
    request_id: string;
    success?: boolean;
    data?: T;
    message?: string | null;
    error?: string | null;
  };
};

export type WsError = {
  type: "error";
  payload: {
    request_id?: string;
    code: "validation_error" | "not_found" | "error" | "already_running";
    message: string;
  };
};

export type WsNotification<T = unknown> = {
  type: "notification";
  payload: {
    event: string;
    data: T;
  };
};

export type WorkspaceSetupContextNotification = {
  has_github_issue: boolean;
  has_github_pr: boolean;
  has_requirement_step: boolean;
  auto_extract_todos: boolean;
  has_setup_script: boolean;
};

export type WorkspaceSetupProgressNotification = {
  workspace_id: string;
  status: "creating" | "setting_up" | "completed" | "error";
  step_key?: string | null;
  failed_step_key?: string | null;
  step_title: string;
  output?: string | null;
  replace_output?: boolean;
  requires_confirmation?: boolean;
  success: boolean;
  countdown?: number | null;
  setup_context?: WorkspaceSetupContextNotification | null;
};
