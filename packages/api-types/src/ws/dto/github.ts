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
  /** @deprecated Prefer `steps`. Kept empty for older clients. */
  text?: string;
  total_lines?: number;
  truncated?: boolean;
  tail_lines?: number;
};
