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
