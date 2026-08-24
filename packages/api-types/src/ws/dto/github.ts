/** Shared GitHub issue/PR payload shapes (multi-client). */

export type GithubIssueLabelPayload = {
  name: string;
  color: string | null;
  description: string | null;
};

export type GithubIssueAssigneePayload = {
  login: string;
  avatar_url?: string | null;
};

export type GithubContributionDayPayload = {
  date: string;
  count: number;
  level: number;
};

/** Hover-card payload: public profile + contribution calendar (server via gh GraphQL). */
export type GithubUserCardPayload = {
  login: string;
  name?: string | null;
  avatar_url?: string | null;
  total_contributions: number;
  contributions: GithubContributionDayPayload[];
};

/** Single resource from `GET /rate_limit` (core / search / graphql). */
export type GithubRateLimitResourcePayload = {
  limit: number;
  used: number;
  remaining: number;
  /** Unix epoch seconds when the window resets. */
  reset: number;
};

/**
 * Rate limits for the local `gh` auth token — the three buckets Atmos consumes.
 * Calling `github_rate_limit` uses `GET /rate_limit` (does not count against REST quota).
 */
export type GithubRateLimitPayload = {
  core: GithubRateLimitResourcePayload;
  search: GithubRateLimitResourcePayload;
  graphql: GithubRateLimitResourcePayload;
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
  comments_count: number;
  labels: GithubIssueLabelPayload[];
  /** Issue opener (author), not assignees. */
  author?: GithubIssueAssigneePayload | null;
  assignees: GithubIssueAssigneePayload[];
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
  created_at?: string;
  updated_at?: string;
  author?: GithubIssueAssigneePayload | null;
  assignees?: GithubIssueAssigneePayload[];
};

/** CI / status check node for Task GitHub list rings. */
export type GithubStatusCheckPayload = {
  state?: string | null;
  conclusion?: string | null;
  status?: string | null;
  name?: string | null;
  context?: string | null;
  details_url?: string | null;
  target_url?: string | null;
  workflow_name?: string | null;
};

/** Multi-repo GitHub Search hit for the Task surface. */
export type GithubSearchItemPayload = {
  owner: string;
  repo: string;
  number: number;
  title: string;
  body: string | null;
  url: string;
  state: string;
  created_at?: string;
  updated_at?: string;
  /** Web-accurate total for PRs (`totalCommentsCount`); issue comments for issues. */
  comments_count?: number;
  labels: GithubIssueLabelPayload[];
  author?: GithubIssueAssigneePayload | null;
  assignees: GithubIssueAssigneePayload[];
  is_draft: boolean;
  head_ref?: string | null;
  base_ref?: string | null;
  /** `"issue"` | `"pr"` */
  kind: string;
  /** PR CI rollup for list rings (empty for issues). */
  status_checks?: GithubStatusCheckPayload[];
  /** Linked issues (on PR rows) or linked PRs (on issue rows). */
  linked_refs?: GithubLinkedRefPayload[];
};

/** Cross-link chip for Task list (issue ↔ PR). */
export type GithubLinkedRefPayload = {
  /** `"issue"` | `"pr"` */
  kind: string;
  number: number;
  state?: string | null;
  title?: string | null;
  url?: string | null;
};

export type GithubSearchPagePayload = {
  items: GithubSearchItemPayload[];
  has_more: boolean;
  total_count: number;
};

/** Raw `.github/ISSUE_TEMPLATE` file for client-side YAML/Markdown parsing. */
export type GithubIssueTemplateFilePayload = {
  name: string;
  content: string;
};

/** Repo security policy (`SECURITY.md`) for the create-issue chooser. */
export type GithubSecurityPolicyPayload = {
  path: string;
  content: string;
  html_url?: string | null;
};

export type GithubIssueTemplatesPayload = {
  files: GithubIssueTemplateFilePayload[];
  /** Present when the repo has a published security policy. */
  security_policy?: GithubSecurityPolicyPayload | null;
};

export type GithubIssueCreatePayload = {
  number?: number | null;
  url: string;
};

export type GithubActionsRunPayload = {
  databaseId: number;
  workflowName: string;
  displayTitle: string;
  status: string;
  conclusion: string;
  createdAt: string;
  url: string;
  event: string;
  headBranch: string;
  headSha: string;
};

export type GithubActionsStepPayload = {
  name?: string;
  status?: string;
  conclusion?: string;
  number?: number;
  startedAt?: string;
  started_at?: string;
  completedAt?: string;
  completed_at?: string;
};

export type GithubActionsJobPayload = {
  databaseId?: number;
  id?: number;
  name?: string;
  status?: string;
  conclusion?: string;
  startedAt?: string;
  started_at?: string;
  completedAt?: string;
  completed_at?: string;
  url?: string;
  html_url?: string;
  summary?: string;
  steps?: GithubActionsStepPayload[];
};

export type GithubActionsArtifactPayload = {
  id?: number;
  name?: string;
  size_in_bytes?: number;
  sizeInBytes?: number;
  expired?: boolean;
  expires_at?: string;
  expiresAt?: string;
  digest?: string;
  archive_download_url?: string;
  archiveDownloadUrl?: string;
};

export type GithubActionsAnnotationPayload = {
  annotation_level?: "notice" | "warning" | "failure" | string;
  annotationLevel?: "notice" | "warning" | "failure" | string;
  message?: string;
  title?: string;
  path?: string;
  start_line?: number;
  startLine?: number;
  end_line?: number;
  endLine?: number;
  job_id?: number;
  jobId?: number;
  job_name?: string;
  jobName?: string;
};

export type GithubActionsWorkflowFilePayload = {
  path: string;
  content: string;
};

export type GithubActionsDetailPayload = Partial<GithubActionsRunPayload> & {
  id?: number;
  name?: string;
  workflow_name?: string;
  display_title?: string;
  created_at?: string;
  run_started_at?: string;
  html_url?: string;
  head_branch?: string;
  head_sha?: string;
  actor?: {
    login?: string;
    avatar_url?: string;
    avatarUrl?: string;
  };
  jobs?: GithubActionsJobPayload[];
  artifacts?: GithubActionsArtifactPayload[];
  annotations?: GithubActionsAnnotationPayload[];
  workflow_file?: GithubActionsWorkflowFilePayload;
};

/** Per-step log excerpt for a failed Actions job. */
export type GithubActionsJobStepLogPayload = {
  number: number;
  name: string;
  conclusion?: string | null;
  text: string;
  total_lines: number;
  truncated: boolean;
};

/**
 * Failed-job logs partitioned by step (timestamp windows).
 * Successful steps are omitted; only failed/timed_out/… steps include `text`.
 */
export type GithubActionsJobLogsPayload = {
  job_id: number;
  job_total_lines?: number;
  steps: GithubActionsJobStepLogPayload[];
  text?: string;
  total_lines?: number;
  truncated?: boolean;
  tail_lines?: number;
};

export type GithubPage<T> = {
  items: T[];
  has_more: boolean;
};

export type GithubLinkedPrPayload = {
  number: number;
  title: string;
  url: string;
  state: string;
  headRefName?: string;
};

export type GithubRepoLabel = {
  name: string;
  color?: string | null;
  description?: string | null;
};

export type GithubRepoAssignee = {
  login: string;
  avatar_url?: string | null;
};

export type GithubPrFile = {
  sha: string;
  filename: string;
  previous_filename?: string;
  status: string;
  additions: number;
  deletions: number;
  changes: number;
  patch?: string;
  raw_url?: string;
  blob_url?: string;
  contents_url?: string;
};

export type GithubPrConflictFilesResponse = {
  files?: string[];
  contents?: Record<string, string>;
  source?: string;
  reason?: string;
  base_oid?: string;
  head_oid?: string;
};

export type GithubIssueListRequest = {
  owner: string;
  repo: string;
  state?: string;
  limit?: number;
  sort?: string;
  direction?: string;
  search?: string | null;
};

export type GithubIssueGetRequest = {
  owner?: string | null;
  repo?: string | null;
  issue_number?: number | null;
  issue_url?: string | null;
};

export type GithubIssueTimelinePageRequest = {
  owner: string;
  repo: string;
  issue_number: number;
  page: number;
  per_page: number;
};

export type GithubIssuePageRequest = {
  owner: string;
  repo: string;
  state: string;
  page: number;
  per_page: number;
  sort?: string;
  direction?: string;
};

export type GithubIssueLinkedPrsRequest = {
  owner: string;
  repo: string;
  issue_number: number;
};

export type GithubPrListRepoRequest = {
  owner: string;
  repo: string;
  state?: string;
  limit?: number;
};

export type GithubSearchRepoRef = {
  owner: string;
  repo: string;
};

export type GithubSearchRequest = {
  kind: string;
  repos?: GithubSearchRepoRef[];
  state?: string;
  assignees?: string[];
  labels?: string[];
  query?: string | null;
  page?: number;
  per_page?: number;
};

export type GithubIssueTemplatesRequest = {
  owner: string;
  repo: string;
};

export type GithubIssueCreateRequest = {
  owner: string;
  repo: string;
  title: string;
  body?: string | null;
  labels?: string[];
  assignees?: string[];
};

export type GithubPrGetRequest = {
  owner?: string | null;
  repo?: string | null;
  pr_number?: number | null;
  pr_url?: string | null;
};

export type GithubPrListRequest = {
  owner: string;
  repo: string;
  branch: string;
  state?: string | null;
  emit_branch_status_refresh?: boolean;
};

export type GithubPrBranchPageRequest = {
  owner: string;
  repo: string;
  branch: string;
  state: string;
  page: number;
  per_page: number;
};

export type GithubPrDetailRequest = {
  owner: string;
  repo: string;
  pr_number: number;
};

export type GithubPrCreateRequest = {
  owner: string;
  repo: string;
  branch: string;
  title: string;
  body?: string | null;
  base_branch: string;
  draft?: boolean | null;
};

export type GithubPrMergeRequest = {
  owner: string;
  repo: string;
  pr_number: number;
  strategy: string;
  body?: string | null;
};

export type GithubPrCloseRequest = {
  owner: string;
  repo: string;
  pr_number: number;
  comment?: string | null;
};

export type GithubPrNumberRequest = {
  owner: string;
  repo: string;
  pr_number: number;
};

export type GithubPrCommentRequest = {
  owner: string;
  repo: string;
  pr_number: number;
  body: string;
};

export type GithubRepoLabelsRequest = {
  owner: string;
  repo: string;
  limit?: number;
};

export type GithubRepoAssigneesRequest = {
  owner: string;
  repo: string;
};

export type GithubUserCardRequest = {
  login: string;
};

export type GithubPrUpdateLabelsRequest = {
  owner: string;
  repo: string;
  pr_number: number;
  add?: string[];
  remove?: string[];
};

export type GithubPrUpdateAssigneesRequest = {
  owner: string;
  repo: string;
  pr_number: number;
  add?: string[];
  remove?: string[];
};

export type GithubIssueUpdateLabelsRequest = {
  owner: string;
  repo: string;
  issue_number: number;
  add?: string[];
  remove?: string[];
};

export type GithubIssueUpdateAssigneesRequest = {
  owner: string;
  repo: string;
  issue_number: number;
  add?: string[];
  remove?: string[];
};

export type GithubIssueActionRequest = {
  owner: string;
  repo: string;
  issue_number: number;
  body?: string | null;
};

export type GithubPrUpdateLinkedIssuesRequest = {
  owner: string;
  repo: string;
  pr_number: number;
  add?: number[];
  remove?: number[];
};

export type GithubPrTimelinePageRequest = {
  owner: string;
  repo: string;
  pr_number: number;
  page: number;
  per_page: number;
};

export type GithubCiStatusRequest = {
  owner: string;
  repo: string;
  branch: string;
};

export type GithubCiOpenBrowserRequest = {
  owner: string;
  repo: string;
  run_id: number;
};

export type GithubActionsListRequest = {
  owner: string;
  repo: string;
  branch: string;
};

export type GithubActionsRerunRequest = {
  owner: string;
  repo: string;
  run_id: number;
  failed_only?: boolean | null;
};

export type GithubPrFilesRequest = {
  owner: string;
  repo: string;
  pr_number: number;
};

export type GithubPrConflictFilesRequest = {
  owner: string;
  repo: string;
  pr_number: number;
  repo_path?: string | null;
  include_contents?: boolean;
};

export type GithubActionsDetailRequest = {
  owner: string;
  repo: string;
  run_id: number;
};

export type GithubActionsJobLogsRequest = {
  owner: string;
  repo: string;
  job_id: number;
  tail_lines?: number | null;
};

export type GithubCommitDetailRequest = {
  owner: string;
  repo: string;
  sha: string;
};
