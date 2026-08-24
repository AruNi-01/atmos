import type { GithubIssuePayload, GithubPrPayload } from "./github";

export type WorkspaceCreateSourceModel = "manual" | "automation";

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
  /** Active Linear issue links (APP-056). */
  linear_links?: Array<{
    external_id: string;
    identifier: string;
    title: string;
    url: string;
  }>;
  create_source: WorkspaceCreateSourceModel | string;
};

export type WorkspaceAttachmentPayload = {
  filename: string;
  mime?: string | null;
  data_base64: string;
};

export type ArchivedWorkspaceRow = {
  guid: string;
  name: string;
  display_name?: string | null;
  branch: string;
  base_branch: string;
  project_guid: string;
  project_name: string;
  archived_at: string;
};

export type ArchivedWorkspaceListResponse = {
  workspaces: ArchivedWorkspaceRow[];
};

export type WorkspaceListRequest = {
  project_guid: string;
};

export type WorkspaceCreateRequest = {
  project_guid: string;
  name: string;
  display_name?: string | null;
  branch: string;
  base_branch?: string | null;
  sidebar_order?: number;
  initial_requirement?: string | null;
  github_issue?: GithubIssuePayload | null;
  github_pr?: GithubPrPayload | null;
  auto_extract_todos?: boolean;
  priority?: string | null;
  workflow_status?: string | null;
  label_guids?: string[] | null;
  attachments?: WorkspaceAttachmentPayload[];
};

export type WorkspaceGuidRequest = {
  guid: string;
};

export type WorkspaceUpdateNameRequest = {
  guid: string;
  name: string;
};

export type WorkspaceUpdateBranchRequest = {
  guid: string;
  branch: string;
};

export type WorkspaceUpdateWorkflowStatusRequest = {
  guid: string;
  workflow_status: string;
};

export type WorkspaceUpdatePriorityRequest = {
  guid: string;
  priority: string;
};

export type WorkspaceLabelCreateRequest = {
  name: string;
  color: string;
  source?: string;
};

export type WorkspaceLabelUpdateRequest = {
  guid: string;
  name: string;
  color: string;
  source?: string | null;
};

export type WorkspaceLabelListRequest = {
  deleted_only?: boolean;
};

export type WorkspaceUpdateLabelsRequest = {
  guid: string;
  label_guids?: string[];
};

export type WorkspaceUpdateOrderRequest = {
  guid: string;
  sidebar_order: number;
};

export type WorkspaceUpdatePinOrderRequest = {
  workspace_ids: string[];
};

export type WorkspaceRetrySetupRequest = {
  guid: string;
  failed_step_key: string;
  initial_requirement?: string | null;
  github_issue?: GithubIssuePayload | null;
  github_pr?: GithubPrPayload | null;
  auto_extract_todos?: boolean;
};

export type WorkspaceSkipSetupStepRequest = WorkspaceRetrySetupRequest;

export type WorkspaceConfirmTodosRequest = {
  guid: string;
  markdown: string;
};

export type GitIgnoreDirStrategy = "symlink" | "copy" | "off";

export type GitIgnoreDirEntry = {
  id: string;
  path: string;
  strategy: GitIgnoreDirStrategy;
  builtin: boolean;
};

export type GitIgnoreDirsConfig = {
  enabled: boolean;
  entries: GitIgnoreDirEntry[];
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
  requires_script_trust?: boolean;
  script_project_guid?: string | null;
  script_hash?: string | null;
  success: boolean;
  countdown?: number | null;
  setup_context?: WorkspaceSetupContextNotification | null;
};

export type WorkspaceGitignoreSyncFailedNotification = {
  workspace_id: string;
  message: string;
};

export type WorkspaceDeleteProgressNotification = {
  workspace_id: string;
  step: string;
  message: string;
  success: boolean;
};

export type ProjectDeleteProgressNotification = {
  project_id: string;
  step: string;
  message: string;
  success: boolean;
};

