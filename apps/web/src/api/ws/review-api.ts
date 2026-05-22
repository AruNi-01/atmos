"use client";

import { wsRequest } from "@/api/ws/request";

export interface ReviewAnchor {
  file_path: string;
  side: string;
  start_line: number;
  end_line: number;
  line_range_kind: string;
  selected_text?: string | null;
  before_context?: string[];
  after_context?: string[];
  hunk_header?: string | null;
}

export interface ReviewMessageModel {
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
}

export interface ReviewMessageDto {
  body_full: string;
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
}

export interface ReviewCommentDto {
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
}

export interface ReviewFileSnapshotModel {
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
}

export interface ReviewFileStateModel {
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
}

export interface ReviewFileDto {
  snapshot: ReviewFileSnapshotModel;
  state: ReviewFileStateModel;
  changed_after_review: boolean;
  open_comment_count: number;
  additions: number;
  deletions: number;
}

export interface ReviewRevisionDto {
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
  files: ReviewFileDto[];
}

export interface ReviewRevisionModel {
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
}

export interface ReviewAgentRunModel {
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
}

export interface ReviewSessionDto {
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
}

export interface ReviewAgentRunCreatedDto {
  run: ReviewAgentRunModel;
  revision: ReviewRevisionDto;
  prompt: string;
}

export interface ReviewAgentRunFinalizedDto {
  run: ReviewAgentRunModel;
  revision: ReviewRevisionModel;
}

export type ReviewAgentRunStatusDto =
  | { kind: "run"; run: ReviewAgentRunModel }
  | { kind: "finalized"; run: ReviewAgentRunModel; revision: ReviewRevisionModel };

export interface ReviewFileContentDto {
  file_snapshot: ReviewFileSnapshotModel;
  old_content: string;
  new_content: string;
}

export interface ReviewRunArtifactDto {
  run: ReviewAgentRunModel;
  kind: string;
  content: string;
}

export type ReviewTarget =
  | { kind: "workspace"; workspaceId: string }
  | { kind: "project"; projectId: string };

export const reviewWsApi = {
  listSessions: async (
    target: ReviewTarget,
    includeArchived = false,
  ): Promise<ReviewSessionDto[]> => {
    const payload =
      target.kind === "workspace"
        ? { workspace_guid: target.workspaceId, include_archived: includeArchived }
        : { project_guid: target.projectId, include_archived: includeArchived };
    return wsRequest<ReviewSessionDto[]>("review_session_list", payload);
  },

  getSession: async (sessionGuid: string): Promise<ReviewSessionDto | null> => {
    return wsRequest<ReviewSessionDto | null>("review_session_get", {
      session_guid: sessionGuid,
    });
  },

  createSession: async (data: {
    target: ReviewTarget;
    title?: string | null;
    createdBy?: string | null;
  }): Promise<ReviewSessionDto> => {
    const targetPayload =
      data.target.kind === "workspace"
        ? { workspace_guid: data.target.workspaceId }
        : { project_guid: data.target.projectId };
    return wsRequest<ReviewSessionDto>(
      "review_session_create",
      {
        ...targetPayload,
        title: data.title ?? null,
        created_by: data.createdBy ?? null,
      },
      60_000,
    );
  },

  closeSession: async (sessionGuid: string): Promise<{ ok: boolean }> => {
    return wsRequest<{ ok: boolean }>("review_session_close", {
      session_guid: sessionGuid,
    });
  },

  archiveSession: async (sessionGuid: string): Promise<{ ok: boolean }> => {
    return wsRequest<{ ok: boolean }>("review_session_archive", {
      session_guid: sessionGuid,
    });
  },

  activateSession: async (sessionGuid: string): Promise<{ ok: boolean }> => {
    return wsRequest<{ ok: boolean }>("review_session_activate", {
      session_guid: sessionGuid,
    });
  },

  renameSession: async (sessionGuid: string, title: string): Promise<{ ok: boolean }> => {
    return wsRequest<{ ok: boolean }>("review_session_rename", {
      session_guid: sessionGuid,
      title,
    });
  },

  listFilesByRevision: async (revisionGuid: string): Promise<ReviewFileDto[]> => {
    return wsRequest<ReviewFileDto[]>("review_file_list", {
      revision_guid: revisionGuid,
    });
  },

  getFileContent: async (
    fileSnapshotGuid: string,
  ): Promise<ReviewFileContentDto> => {
    return wsRequest<ReviewFileContentDto>("review_file_content_get", {
      file_snapshot_guid: fileSnapshotGuid,
    });
  },

  setFileReviewed: async (data: {
    fileStateGuid: string;
    reviewed: boolean;
    reviewedBy?: string | null;
  }): Promise<{ ok: boolean }> => {
    return wsRequest<{ ok: boolean }>("review_file_set_reviewed", {
      file_state_guid: data.fileStateGuid,
      reviewed: data.reviewed,
      reviewed_by: data.reviewedBy ?? null,
    });
  },

  listComments: async (data: {
    sessionGuid: string;
    revisionGuid?: string | null;
  }): Promise<ReviewCommentDto[]> => {
    return wsRequest<ReviewCommentDto[]>("review_comment_list", {
      session_guid: data.sessionGuid,
      revision_guid: data.revisionGuid ?? null,
    });
  },

  createComment: async (data: {
    sessionGuid: string;
    revisionGuid: string;
    fileSnapshotGuid: string;
    anchor: ReviewAnchor;
    body: string;
    title?: string | null;
    createdBy?: string | null;
    parentCommentGuid?: string | null;
  }): Promise<ReviewCommentDto> => {
    return wsRequest<ReviewCommentDto>("review_comment_create", {
      session_guid: data.sessionGuid,
      revision_guid: data.revisionGuid,
      file_snapshot_guid: data.fileSnapshotGuid,
      anchor: data.anchor,
      body: data.body,
      title: data.title ?? null,
      created_by: data.createdBy ?? null,
      parent_comment_guid: data.parentCommentGuid ?? null,
    });
  },

  updateCommentStatus: async (
    commentGuid: string,
    status: string,
  ): Promise<{ ok: boolean }> => {
    return wsRequest<{ ok: boolean }>("review_comment_update_status", {
      comment_guid: commentGuid,
      status,
    });
  },

  addMessage: async (data: {
    commentGuid: string;
    authorType: string;
    kind: string;
    body: string;
    agentRunGuid?: string | null;
  }): Promise<ReviewMessageDto> => {
    return wsRequest<ReviewMessageDto>("review_message_add", {
      comment_guid: data.commentGuid,
      author_type: data.authorType,
      kind: data.kind,
      body: data.body,
      agent_run_guid: data.agentRunGuid ?? null,
    });
  },

  updateMessage: async (messageGuid: string, body: string): Promise<ReviewMessageDto> => {
    return wsRequest<ReviewMessageDto>("review_message_update", {
      message_guid: messageGuid,
      body,
    });
  },

  deleteMessage: async (messageGuid: string): Promise<{ ok: boolean }> => {
    return wsRequest<{ ok: boolean }>("review_message_delete", {
      message_guid: messageGuid,
    });
  },

  listAgentRuns: async (sessionGuid: string): Promise<ReviewAgentRunModel[]> => {
    return wsRequest<ReviewAgentRunModel[]>("review_agent_run_list", {
      session_guid: sessionGuid,
    });
  },

  createAgentRun: async (data: {
    sessionGuid: string;
    baseRevisionGuid: string;
    runKind: string;
    executionMode: string;
    skillId?: string | null;
    selectedCommentGuids?: string[];
    createdBy?: string | null;
  }): Promise<ReviewAgentRunCreatedDto> => {
    return wsRequest<ReviewAgentRunCreatedDto>("review_agent_run_create", {
      session_guid: data.sessionGuid,
      base_revision_guid: data.baseRevisionGuid,
      run_kind: data.runKind,
      execution_mode: data.executionMode,
      skill_id: data.skillId ?? null,
      selected_comment_guids: data.selectedCommentGuids ?? [],
      created_by: data.createdBy ?? null,
    }, 60_000);
  },

  getRunArtifact: async (data: {
    runGuid: string;
    kind: "prompt" | "patch" | "summary";
  }): Promise<ReviewRunArtifactDto> => {
    return wsRequest<ReviewRunArtifactDto>("review_agent_run_artifact_get", {
      run_guid: data.runGuid,
      kind: data.kind,
    });
  },

  finalizeAgentRun: async (data: {
    runGuid: string;
    title?: string | null;
  }): Promise<ReviewAgentRunFinalizedDto> => {
    return wsRequest<ReviewAgentRunFinalizedDto>("review_agent_run_finalize", {
      run_guid: data.runGuid,
      title: data.title ?? null,
    }, 60_000);
  },

  setAgentRunStatus: async (data: {
    runGuid: string;
    status: "running" | "succeeded" | "failed";
    message?: string | null;
    title?: string | null;
    summary?: string | null;
  }): Promise<ReviewAgentRunStatusDto> => {
    return wsRequest<ReviewAgentRunStatusDto>("review_agent_run_set_status", {
      run_guid: data.runGuid,
      status: data.status,
      message: data.message ?? null,
      title: data.title ?? null,
      summary: data.summary ?? null,
    }, 60_000);
  },
};
