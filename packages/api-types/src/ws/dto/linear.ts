/** Linear integration wire DTOs (APP-056). */

export type LinearRateLimitResourcePayload = {
  limit: number;
  used: number;
  remaining: number;
  /** Unix epoch milliseconds when the window resets. */
  reset: number;
};

export type LinearRateLimitPayload = {
  requests: LinearRateLimitResourcePayload | null;
  complexity: LinearRateLimitResourcePayload | null;
};

export type LinearStatusPayload = {
  connected: boolean;
  auth_method?: string | null;
  viewer_name?: string | null;
  viewer_email?: string | null;
  /** True when Atmos Hub session is required but missing (APP-056/057). */
  needs_hub_login?: boolean;
};

export type LinearLabelPayload = {
  name: string;
  color?: string | null;
};

export type LinearAssigneePayload = {
  name: string;
  avatar_url?: string | null;
};

export type LinearGithubRefPayload = {
  owner: string;
  repo: string;
  number: number;
  kind: string;
  url: string;
};

export type LinearIssuePayload = {
  id: string;
  identifier: string;
  title: string;
  url: string;
  description?: string | null;
  priority: number;
  state_name?: string | null;
  state_type?: string | null;
  project_name?: string | null;
  project_id?: string | null;
  team_id?: string | null;
  team_key?: string | null;
  labels: LinearLabelPayload[];
  assignee?: LinearAssigneePayload | null;
  github_refs: LinearGithubRefPayload[];
  created_at?: string | null;
  updated_at?: string | null;
};

export type LinearIssueListPagePayload = {
  issues: LinearIssuePayload[];
  has_next_page: boolean;
  end_cursor?: string | null;
};

export type LinearLinkPayload = {
  guid: string;
  workspace_guid: string;
  provider: string;
  external_id: string;
  identifier: string;
  title: string;
  url: string;
  snapshot_json?: string | null;
  linked_at: string;
};
