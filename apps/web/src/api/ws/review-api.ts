"use client";

import { wsRequest } from "@/api/ws/request";
import type {
  ReviewAnchor,
  ReviewAgentRunCreatedDto,
  ReviewAgentRunFinalizedDto,
  ReviewAgentRunModel,
  ReviewAgentRunStatusDto,
  ReviewCommentDto,
  ReviewFileContentDto,
  ReviewFileContentGetBatchResponse,
  ReviewFileDto,
  ReviewMessageDto,
  ReviewRunArtifactDto,
  ReviewSessionDto,
} from "@atmos/api-types/ws/dto/review";

export type {
  ReviewAnchor,
  ReviewAgentRunCreatedDto,
  ReviewAgentRunFinalizedDto,
  ReviewAgentRunModel,
  ReviewAgentRunStatusDto,
  ReviewCommentDto,
  ReviewFileContentDto,
  ReviewFileContentGetBatchResponse,
  ReviewFileContentGetBatchResult,
  ReviewFileDto,
  ReviewFileSnapshotModel,
  ReviewFileStateModel,
  ReviewMessageDto,
  ReviewMessageModel,
  ReviewRevisionDto,
  ReviewRevisionModel,
  ReviewRunArtifactDto,
  ReviewSessionDto,
} from "@atmos/api-types/ws/dto/review";

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
    return wsRequest("review_session_list", payload);
  },

  getSession: async (sessionGuid: string): Promise<ReviewSessionDto | null> => {
    return wsRequest("review_session_get", {
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
    return wsRequest("review_session_create",
      {
        ...targetPayload,
        title: data.title ?? null,
        created_by: data.createdBy ?? null,
      },
      60_000,
    );
  },

  closeSession: async (sessionGuid: string): Promise<{ ok: boolean }> => {
    return wsRequest("review_session_close", {
      session_guid: sessionGuid,
    });
  },

  archiveSession: async (sessionGuid: string): Promise<{ ok: boolean }> => {
    return wsRequest("review_session_archive", {
      session_guid: sessionGuid,
    });
  },

  activateSession: async (sessionGuid: string): Promise<{ ok: boolean }> => {
    return wsRequest("review_session_activate", {
      session_guid: sessionGuid,
    });
  },

  renameSession: async (sessionGuid: string, title: string): Promise<{ ok: boolean }> => {
    return wsRequest("review_session_rename", {
      session_guid: sessionGuid,
      title,
    });
  },

  listFilesByRevision: async (revisionGuid: string): Promise<ReviewFileDto[]> => {
    return wsRequest("review_file_list", {
      revision_guid: revisionGuid,
    });
  },

  getFileContent: async (
    fileSnapshotGuid: string,
  ): Promise<ReviewFileContentDto> => {
    return wsRequest("review_file_content_get", {
      file_snapshot_guid: fileSnapshotGuid,
    });
  },

  getFileContents: async (
    fileSnapshotGuids: string[],
  ): Promise<ReviewFileContentGetBatchResponse> => {
    return wsRequest("review_file_content_get_batch",
      {
        file_snapshot_guids: fileSnapshotGuids,
      },
    );
  },

  setFileReviewed: async (data: {
    fileStateGuid: string;
    reviewed: boolean;
    reviewedBy?: string | null;
  }): Promise<{ ok: boolean }> => {
    return wsRequest("review_file_set_reviewed", {
      file_state_guid: data.fileStateGuid,
      reviewed: data.reviewed,
      reviewed_by: data.reviewedBy ?? null,
    });
  },

  listComments: async (data: {
    sessionGuid: string;
    revisionGuid?: string | null;
  }): Promise<ReviewCommentDto[]> => {
    return wsRequest("review_comment_list", {
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
    return wsRequest("review_comment_create", {
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
    return wsRequest("review_comment_update_status", {
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
    return wsRequest("review_message_add", {
      comment_guid: data.commentGuid,
      author_type: data.authorType,
      kind: data.kind,
      body: data.body,
      agent_run_guid: data.agentRunGuid ?? null,
    });
  },

  updateMessage: async (messageGuid: string, body: string): Promise<ReviewMessageDto> => {
    return wsRequest("review_message_update", {
      message_guid: messageGuid,
      body,
    });
  },

  deleteMessage: async (messageGuid: string): Promise<{ ok: boolean }> => {
    return wsRequest("review_message_delete", {
      message_guid: messageGuid,
    });
  },

  listAgentRuns: async (sessionGuid: string): Promise<ReviewAgentRunModel[]> => {
    return wsRequest("review_agent_run_list", {
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
    return wsRequest("review_agent_run_create", {
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
    return wsRequest("review_agent_run_artifact_get", {
      run_guid: data.runGuid,
      kind: data.kind,
    });
  },

  finalizeAgentRun: async (data: {
    runGuid: string;
    title?: string | null;
  }): Promise<ReviewAgentRunFinalizedDto> => {
    return wsRequest("review_agent_run_finalize", {
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
    return wsRequest("review_agent_run_set_status", {
      run_guid: data.runGuid,
      status: data.status,
      message: data.message ?? null,
      title: data.title ?? null,
      summary: data.summary ?? null,
    }, 60_000);
  },
};
