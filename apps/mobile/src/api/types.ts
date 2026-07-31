/** Mobile API types — shared wire DTOs from `@atmos/api-types`; mobile-only shapes stay here. */

export type {
  WsError,
  WsMessage,
  WsNotification,
  WsRequest,
  WsResponse,
} from "@atmos/api-types/ws/frames";
export type { WsAction } from "@atmos/api-types/ws/actions";

export type {
  FsEntry,
  FsListDirResponse,
  FsValidateGitPathResponse,
} from "@atmos/api-types/ws/dto/fs";
export type {
  GitChangedFile,
  GitChangedFilesResponse,
  GitCommitResponse,
  GitStatusResponse,
} from "@atmos/api-types/ws/dto/git";
export type {
  ProjectModel,
  ProjectWorkspaceBootstrapResponse,
} from "@atmos/api-types/ws/dto/project";
export type {
  WorkspaceLabelModel,
  WorkspaceModel,
} from "@atmos/api-types/ws/dto/workspace";
export type { GroupMemberModel, GroupModel } from "@atmos/api-types/ws/dto/group";
export type {
  GithubIssueLabelPayload,
  GithubIssuePayload,
  GithubPrPayload,
} from "@atmos/api-types/ws/dto/github";

/** Mobile transitional git diff (accepts legacy + structured fields). */
export type GitFileDiffResponse = {
  file_path: string;
  /** @deprecated use old_text — kept optional during mobile transition */
  old_content?: string;
  /** @deprecated use new_text */
  new_content?: string;
  kind?: "text" | "binary" | "too_large";
  preview_kind?: "none" | "image" | "media";
  old_text?: string | null;
  new_text?: string | null;
  old_size?: number | null;
  new_size?: number | null;
  status: string;
  compare_ref: string | null;
};

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
