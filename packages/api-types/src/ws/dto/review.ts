export type ReviewSessionListRequest = {
  workspace_guid?: string | null;
  project_guid?: string | null;
  include_archived?: boolean;
};

export type ReviewSessionGetRequest = {
  session_guid: string;
};

export type ReviewSessionCreateRequest = {
  workspace_guid?: string | null;
  project_guid?: string | null;
  title?: string | null;
  created_by?: string | null;
};

export type ReviewSessionGuidRequest = {
  session_guid: string;
};

export type ReviewSessionRenameRequest = {
  session_guid: string;
  title: string;
};

export type ReviewFileListRequest = {
  revision_guid: string;
};

export type ReviewFileContentGetRequest = {
  file_snapshot_guid: string;
};

export type ReviewFileContentGetBatchRequest = {
  file_snapshot_guids: string[];
};

export type ReviewFileSetReviewedRequest = {
  file_state_guid: string;
  reviewed: boolean;
  reviewed_by?: string | null;
};

export type ReviewCommentListRequest = {
  session_guid: string;
  revision_guid?: string | null;
};

export type ReviewAnchor = {
  file_path: string;
  side: string;
  start_line: number;
  end_line: number;
  line_range_kind: string;
  selected_text?: string | null;
  before_context?: string[];
  after_context?: string[];
  hunk_header?: string | null;
};

export type ReviewCommentCreateRequest = {
  session_guid: string;
  revision_guid: string;
  file_snapshot_guid: string;
  anchor: ReviewAnchor;
  body: string;
  title?: string | null;
  created_by?: string | null;
  parent_comment_guid?: string | null;
};

export type ReviewCommentUpdateStatusRequest = {
  comment_guid: string;
  status: string;
};

export type ReviewMessageAddRequest = {
  comment_guid: string;
  author_type: string;
  kind: string;
  body: string;
  agent_run_guid?: string | null;
};

export type ReviewMessageUpdateRequest = {
  message_guid: string;
  body: string;
};

export type ReviewMessageDeleteRequest = {
  message_guid: string;
};

export type ReviewAgentRunListRequest = {
  session_guid: string;
};

export type ReviewAgentRunCreateRequest = {
  session_guid: string;
  base_revision_guid: string;
  run_kind: string;
  execution_mode: string;
  skill_id?: string | null;
  selected_comment_guids?: string[];
  created_by?: string | null;
};

export type ReviewAgentRunArtifactKind = "prompt" | "patch" | "summary";

export type ReviewAgentRunArtifactGetRequest = {
  run_guid: string;
  kind: ReviewAgentRunArtifactKind | string;
};

export type ReviewAgentRunFinalizeRequest = {
  run_guid: string;
  title?: string | null;
};

export type ReviewAgentRunSetStatusRequest = {
  run_guid: string;
  status: "running" | "succeeded" | "failed" | string;
  message?: string | null;
  title?: string | null;
  summary?: string | null;
};

export type ReviewMessageModel = {
  guid: string;
  created_at: string;
  updated_at: string;
  is_deleted: boolean;
  comment_guid: string;
  author_type: string;
  kind: string;
  body_storage_kind: string;
  body: string;
  body_rel_path: string | null;
  agent_run_guid: string | null;
};

export type ReviewMessageDto = ReviewMessageModel & {
  body_full: string;
};

export type ReviewCommentDto = {
  guid: string;
  created_at: string;
  updated_at: string;
  is_deleted: boolean;
  session_guid: string;
  revision_guid: string;
  file_snapshot_guid: string;
  anchor_side: string;
  anchor_start_line: number;
  anchor_end_line: number;
  anchor_line_range_kind: string;
  anchor_json: string;
  status: string;
  parent_comment_guid: string | null;
  title: string | null;
  created_by: string | null;
  fixed_at: string | null;
  anchor: ReviewAnchor;
  messages: ReviewMessageDto[];
};

export type ReviewFileSnapshotModel = {
  guid: string;
  created_at: string;
  updated_at: string;
  is_deleted: boolean;
  revision_guid: string;
  file_identity_guid: string;
  file_path: string;
  git_status: string;
  old_rel_path: string;
  new_rel_path: string;
  meta_rel_path: string;
  old_sha256: string | null;
  new_sha256: string | null;
  old_size: number;
  new_size: number;
  is_binary: boolean;
  display_order: number;
};

export type ReviewFileStateModel = {
  guid: string;
  created_at: string;
  updated_at: string;
  is_deleted: boolean;
  revision_guid: string;
  file_identity_guid: string;
  file_snapshot_guid: string;
  reviewed: boolean;
  reviewed_at: string | null;
  reviewed_by: string | null;
  inherited_from_file_state_guid: string | null;
  last_code_change_at: string | null;
};

export type ReviewFileDto = {
  snapshot: ReviewFileSnapshotModel;
  state: ReviewFileStateModel;
  changed_after_review: boolean;
  open_comment_count: number;
  additions: number;
  deletions: number;
};

export type ReviewRevisionModel = {
  guid: string;
  created_at: string;
  updated_at: string;
  is_deleted: boolean;
  session_guid: string;
  parent_revision_guid: string | null;
  source_kind: string;
  agent_run_guid: string | null;
  title: string | null;
  storage_root_rel_path: string;
  base_revision_guid: string | null;
  created_by: string | null;
};

export type ReviewRevisionDto = ReviewRevisionModel & {
  files: ReviewFileDto[];
};

export type ReviewAgentRunModel = {
  guid: string;
  created_at: string;
  updated_at: string;
  is_deleted: boolean;
  session_guid: string;
  base_revision_guid: string;
  result_revision_guid: string | null;
  run_kind: string;
  execution_mode: string;
  status: string;
  skill_id: string | null;
  prompt_rel_path: string | null;
  result_rel_path: string | null;
  patch_rel_path: string | null;
  summary_rel_path: string | null;
  agent_session_ref: string | null;
  finalize_attempts: number;
  failure_reason: string | null;
  created_by: string | null;
  started_at: string | null;
  finished_at: string | null;
};

export type ReviewSessionDto = {
  guid: string;
  created_at: string;
  updated_at: string;
  is_deleted: boolean;
  workspace_guid: string | null;
  project_guid: string;
  repo_path: string;
  storage_root_rel_path: string;
  base_ref: string | null;
  base_commit: string | null;
  head_commit: string;
  current_revision_guid: string;
  status: string;
  title: string | null;
  created_by: string | null;
  closed_at: string | null;
  archived_at: string | null;
  revisions: ReviewRevisionDto[];
  runs: ReviewAgentRunModel[];
  open_comment_count: number;
  reviewed_file_count: number;
  reviewed_then_changed_count: number;
};

export type ReviewAgentRunCreatedDto = {
  run: ReviewAgentRunModel;
  revision: ReviewRevisionDto;
  prompt: string;
};

export type ReviewAgentRunFinalizedDto = {
  run: ReviewAgentRunModel;
  revision: ReviewRevisionModel;
};

export type ReviewAgentRunStatusDto =
  | { kind: "run"; run: ReviewAgentRunModel }
  | { kind: "finalized"; run: ReviewAgentRunModel; revision: ReviewRevisionModel };

export type ReviewFileContentDto = {
  file_snapshot: ReviewFileSnapshotModel;
  old_content: string;
  new_content: string;
};

export type ReviewFileContentGetBatchResult = {
  file_snapshot_guid: string;
  content: ReviewFileContentDto | null;
  error: string | null;
};

export type ReviewFileContentGetBatchResponse = {
  results: ReviewFileContentGetBatchResult[];
};

export type ReviewRunArtifactDto = {
  run: ReviewAgentRunModel;
  kind: string;
  content: string;
};

export type ReviewOk = { ok: boolean };
