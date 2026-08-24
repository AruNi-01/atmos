import type {
  ReviewAgentRunArtifactGetRequest,
  ReviewAgentRunCreateRequest,
  ReviewAgentRunCreatedDto,
  ReviewAgentRunFinalizeRequest,
  ReviewAgentRunFinalizedDto,
  ReviewAgentRunListRequest,
  ReviewAgentRunModel,
  ReviewAgentRunSetStatusRequest,
  ReviewAgentRunStatusDto,
  ReviewCommentCreateRequest,
  ReviewCommentDto,
  ReviewCommentListRequest,
  ReviewCommentUpdateStatusRequest,
  ReviewFileContentDto,
  ReviewFileContentGetBatchRequest,
  ReviewFileContentGetBatchResponse,
  ReviewFileContentGetRequest,
  ReviewFileDto,
  ReviewFileListRequest,
  ReviewFileSetReviewedRequest,
  ReviewMessageAddRequest,
  ReviewMessageDeleteRequest,
  ReviewMessageDto,
  ReviewMessageUpdateRequest,
  ReviewOk,
  ReviewRunArtifactDto,
  ReviewSessionCreateRequest,
  ReviewSessionDto,
  ReviewSessionGetRequest,
  ReviewSessionGuidRequest,
  ReviewSessionListRequest,
  ReviewSessionRenameRequest,
} from "../dto/review";

export type ReviewContract = {
  review_session_list: {
    input: ReviewSessionListRequest;
    output: ReviewSessionDto[];
  };
  review_session_get: {
    input: ReviewSessionGetRequest;
    output: ReviewSessionDto | null;
  };
  review_session_create: {
    input: ReviewSessionCreateRequest;
    output: ReviewSessionDto;
  };
  review_session_close: { input: ReviewSessionGuidRequest; output: ReviewOk };
  review_session_archive: { input: ReviewSessionGuidRequest; output: ReviewOk };
  review_session_activate: { input: ReviewSessionGuidRequest; output: ReviewOk };
  review_session_rename: {
    input: ReviewSessionRenameRequest;
    output: ReviewOk;
  };
  review_file_list: { input: ReviewFileListRequest; output: ReviewFileDto[] };
  review_file_content_get: {
    input: ReviewFileContentGetRequest;
    output: ReviewFileContentDto;
  };
  review_file_content_get_batch: {
    input: ReviewFileContentGetBatchRequest;
    output: ReviewFileContentGetBatchResponse;
  };
  review_file_set_reviewed: {
    input: ReviewFileSetReviewedRequest;
    output: ReviewOk;
  };
  review_comment_list: {
    input: ReviewCommentListRequest;
    output: ReviewCommentDto[];
  };
  review_comment_create: {
    input: ReviewCommentCreateRequest;
    output: ReviewCommentDto;
  };
  review_comment_update_status: {
    input: ReviewCommentUpdateStatusRequest;
    output: ReviewOk;
  };
  review_message_add: {
    input: ReviewMessageAddRequest;
    output: ReviewMessageDto;
  };
  review_message_update: {
    input: ReviewMessageUpdateRequest;
    output: ReviewMessageDto;
  };
  review_message_delete: {
    input: ReviewMessageDeleteRequest;
    output: ReviewOk;
  };
  review_agent_run_list: {
    input: ReviewAgentRunListRequest;
    output: ReviewAgentRunModel[];
  };
  review_agent_run_create: {
    input: ReviewAgentRunCreateRequest;
    output: ReviewAgentRunCreatedDto;
  };
  review_agent_run_artifact_get: {
    input: ReviewAgentRunArtifactGetRequest;
    output: ReviewRunArtifactDto;
  };
  review_agent_run_finalize: {
    input: ReviewAgentRunFinalizeRequest;
    output: ReviewAgentRunFinalizedDto;
  };
  review_agent_run_set_status: {
    input: ReviewAgentRunSetStatusRequest;
    output: ReviewAgentRunStatusDto;
  };
};
