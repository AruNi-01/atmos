import type { WsSuccess } from "../dto/common";
import type {
  GitBranchesResponse,
  GitChangedFilesRequest,
  GitChangedFilesResponse,
  GitCommitRequest,
  GitCommitResponse,
  GitFileDiffRequest,
  GitFileDiffResponse,
  GitFilesDiffRequest,
  GitFilesDiffResponse,
  GitGenerateCommitMessageRequest,
  GitGenerateCommitMessageResponse,
  GitGetCommitCountRequest,
  GitGetCommitCountResponse,
  GitGetHeadCommitRequest,
  GitGetHeadCommitResponse,
  GitGetStatusBatchRequest,
  GitGetStatusBatchResponse,
  GitGetStatusRequest,
  GitHistoryPage,
  GitHistoryRequest,
  GitListBranchesRequest,
  GitLogPage,
  GitLogRequest,
  GitPatchChunkRequest,
  GitPatchChunkResponse,
  GitPathFilesRequest,
  GitPathRequest,
  GitRenameBranchRequest,
  GitStatusResponse,
} from "../dto/git";

export type GitContract = {
  git_get_status: { input: GitGetStatusRequest; output: GitStatusResponse };
  git_get_status_batch: {
    input: GitGetStatusBatchRequest;
    output: GitGetStatusBatchResponse;
  };
  git_get_head_commit: {
    input: GitGetHeadCommitRequest;
    output: GitGetHeadCommitResponse;
  };
  git_get_commit_count: {
    input: GitGetCommitCountRequest;
    output: GitGetCommitCountResponse;
  };
  git_list_branches: {
    input: GitListBranchesRequest;
    output: GitBranchesResponse;
  };
  git_list_remote_branches: {
    input: GitListBranchesRequest;
    output: GitBranchesResponse;
  };
  git_rename_branch: { input: GitRenameBranchRequest; output: WsSuccess };
  git_changed_files: {
    input: GitChangedFilesRequest;
    output: GitChangedFilesResponse;
  };
  git_file_diff: { input: GitFileDiffRequest; output: GitFileDiffResponse };
  git_files_diff: { input: GitFilesDiffRequest; output: GitFilesDiffResponse };
  git_stage_patch_chunk: {
    input: GitPatchChunkRequest;
    output: GitPatchChunkResponse;
  };
  git_restore_patch_chunk: {
    input: GitPatchChunkRequest;
    output: GitPatchChunkResponse;
  };
  git_generate_commit_message: {
    input: GitGenerateCommitMessageRequest;
    output: GitGenerateCommitMessageResponse;
  };
  git_commit: { input: GitCommitRequest; output: GitCommitResponse };
  git_push: { input: GitPathRequest; output: WsSuccess };
  git_stage: { input: GitPathFilesRequest; output: WsSuccess };
  git_unstage: { input: GitPathFilesRequest; output: WsSuccess };
  git_discard_unstaged: { input: GitPathFilesRequest; output: WsSuccess };
  git_discard_untracked: { input: GitPathFilesRequest; output: WsSuccess };
  git_pull: { input: GitPathRequest; output: WsSuccess };
  git_fetch: { input: GitPathRequest; output: WsSuccess };
  git_sync: { input: GitPathRequest; output: WsSuccess };
  git_log: { input: GitLogRequest; output: GitLogPage };
  git_history: { input: GitHistoryRequest; output: GitHistoryPage };
};
