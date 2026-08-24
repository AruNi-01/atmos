import type { WsEmpty, WsSuccess } from "../dto/common";
import type {
  GithubActionsDetailPayload,
  GithubActionsDetailRequest,
  GithubActionsJobLogsPayload,
  GithubActionsJobLogsRequest,
  GithubActionsListRequest,
  GithubActionsRerunRequest,
  GithubActionsRunPayload,
  GithubCiOpenBrowserRequest,
  GithubCiStatusRequest,
  GithubCommitDetailRequest,
  GithubIssueActionRequest,
  GithubIssueCreatePayload,
  GithubIssueCreateRequest,
  GithubIssueGetRequest,
  GithubIssueLinkedPrsRequest,
  GithubIssueListRequest,
  GithubIssuePageRequest,
  GithubIssuePayload,
  GithubIssueTemplatesPayload,
  GithubIssueTemplatesRequest,
  GithubIssueTimelinePageRequest,
  GithubIssueUpdateAssigneesRequest,
  GithubIssueUpdateLabelsRequest,
  GithubLinkedPrPayload,
  GithubPage,
  GithubPrBranchPageRequest,
  GithubPrCloseRequest,
  GithubPrCommentRequest,
  GithubPrConflictFilesRequest,
  GithubPrConflictFilesResponse,
  GithubPrCreateRequest,
  GithubPrDetailRequest,
  GithubPrFile,
  GithubPrFilesRequest,
  GithubPrGetRequest,
  GithubPrListRepoRequest,
  GithubPrListRequest,
  GithubPrMergeRequest,
  GithubPrNumberRequest,
  GithubPrPayload,
  GithubPrTimelinePageRequest,
  GithubPrUpdateAssigneesRequest,
  GithubPrUpdateLabelsRequest,
  GithubPrUpdateLinkedIssuesRequest,
  GithubRateLimitPayload,
  GithubRepoAssignee,
  GithubRepoAssigneesRequest,
  GithubRepoLabel,
  GithubRepoLabelsRequest,
  GithubSearchPagePayload,
  GithubSearchRequest,
  GithubUserCardPayload,
  GithubUserCardRequest,
} from "../dto/github";

export type GithubContract = {
  github_pr_list: { input: GithubPrListRequest; output: GithubPrPayload[] };
  github_pr_branch_page: {
    input: GithubPrBranchPageRequest;
    output: GithubPage<Record<string, unknown>>;
  };
  github_pr_detail: {
    input: GithubPrDetailRequest;
    output: Record<string, unknown>;
  };
  github_pr_detail_sidebar: {
    input: GithubPrDetailRequest;
    output: Record<string, unknown>;
  };
  github_pr_create: { input: GithubPrCreateRequest; output: GithubPrPayload };
  github_pr_merge: { input: GithubPrMergeRequest; output: WsSuccess };
  github_pr_close: { input: GithubPrCloseRequest; output: WsSuccess };
  github_pr_reopen: { input: GithubPrNumberRequest; output: WsSuccess };
  github_pr_comment: { input: GithubPrCommentRequest; output: WsSuccess };
  github_pr_ready: { input: GithubPrNumberRequest; output: WsSuccess };
  github_pr_open_browser: { input: GithubPrNumberRequest; output: WsSuccess };
  github_pr_draft: { input: GithubPrNumberRequest; output: WsSuccess };
  github_repo_labels: {
    input: GithubRepoLabelsRequest;
    output: GithubRepoLabel[];
  };
  github_repo_assignees: {
    input: GithubRepoAssigneesRequest;
    output: GithubRepoAssignee[];
  };
  github_user_card: {
    input: GithubUserCardRequest;
    output: GithubUserCardPayload;
  };
  github_rate_limit: { input: WsEmpty; output: GithubRateLimitPayload };
  github_pr_update_labels: {
    input: GithubPrUpdateLabelsRequest;
    output: WsSuccess;
  };
  github_pr_update_assignees: {
    input: GithubPrUpdateAssigneesRequest;
    output: WsSuccess;
  };
  github_pr_update_linked_issues: {
    input: GithubPrUpdateLinkedIssuesRequest;
    output: WsSuccess;
  };
  github_pr_timeline_page: {
    input: GithubPrTimelinePageRequest;
    output: GithubPage<unknown>;
  };
  github_issue_list: {
    input: GithubIssueListRequest;
    output: GithubIssuePayload[];
  };
  github_search: {
    input: GithubSearchRequest;
    output: GithubSearchPagePayload;
  };
  github_issue_templates: {
    input: GithubIssueTemplatesRequest;
    output: GithubIssueTemplatesPayload;
  };
  github_issue_create: {
    input: GithubIssueCreateRequest;
    output: GithubIssueCreatePayload;
  };
  github_issue_page: {
    input: GithubIssuePageRequest;
    output: GithubPage<GithubIssuePayload>;
  };
  github_issue_update_labels: {
    input: GithubIssueUpdateLabelsRequest;
    output: WsSuccess;
  };
  github_issue_update_assignees: {
    input: GithubIssueUpdateAssigneesRequest;
    output: WsSuccess;
  };
  github_issue_comment: { input: GithubIssueActionRequest; output: WsSuccess };
  github_issue_close: { input: GithubIssueActionRequest; output: WsSuccess };
  github_issue_reopen: { input: GithubIssueActionRequest; output: WsSuccess };
  github_issue_get: { input: GithubIssueGetRequest; output: GithubIssuePayload };
  github_issue_timeline_page: {
    input: GithubIssueTimelinePageRequest;
    output: GithubPage<unknown>;
  };
  github_issue_linked_prs: {
    input: GithubIssueLinkedPrsRequest;
    output: GithubLinkedPrPayload[];
  };
  github_pr_list_repo: {
    input: GithubPrListRepoRequest;
    output: GithubPrPayload[];
  };
  github_pr_get: { input: GithubPrGetRequest; output: GithubPrPayload };
  github_ci_status: {
    input: GithubCiStatusRequest;
    output: Record<string, unknown>;
  };
  github_ci_open_browser: {
    input: GithubCiOpenBrowserRequest;
    output: WsSuccess;
  };
  github_actions_list: {
    input: GithubActionsListRequest;
    output: GithubActionsRunPayload[];
  };
  github_actions_detail: {
    input: GithubActionsDetailRequest;
    output: GithubActionsDetailPayload;
  };
  github_actions_job_logs: {
    input: GithubActionsJobLogsRequest;
    output: GithubActionsJobLogsPayload;
  };
  github_actions_rerun: { input: GithubActionsRerunRequest; output: WsSuccess };
  github_pr_files: { input: GithubPrFilesRequest; output: GithubPrFile[] };
  github_pr_conflict_files: {
    input: GithubPrConflictFilesRequest;
    output: GithubPrConflictFilesResponse;
  };
  github_commit_detail: {
    input: GithubCommitDetailRequest;
    output: Record<string, unknown>;
  };
};
