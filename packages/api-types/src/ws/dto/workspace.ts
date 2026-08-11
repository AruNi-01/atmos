import type { GithubIssuePayload, GithubPrPayload } from "./github";

export type WorkspaceCreateSourceModel = "manual" | "automation";

export type WorkspaceLabelModel = {
  guid: string;
  name: string;
  color: string;
  source: string;
  created_at?: string;
};

export type WorkspaceModel = {
  guid: string;
  project_guid: string;
  name: string;
  display_name: string | null;
  branch: string;
  base_branch: string;
  sidebar_order: number;
  created_at: string;
  updated_at: string;
  is_deleted: boolean;
  is_pinned: boolean;
  pinned_at: string | null;
  pin_order: number | null;
  is_archived: boolean;
  archived_at: string | null;
  last_visited_at: string | null;
  workflow_status: string;
  priority: string;
  local_path: string;
  github_issue: GithubIssuePayload | null;
  github_pr: GithubPrPayload | null;
  labels: WorkspaceLabelModel[];
  /** Active Linear issue links (APP-056). */
  linear_links?: Array<{
    external_id: string;
    identifier: string;
    title: string;
    url: string;
  }>;
  create_source: WorkspaceCreateSourceModel | string;
};

export type ArchivedWorkspace = WorkspaceModel;

export type WorkspaceAttachmentPayload = {
  name: string;
  path?: string;
  content_type?: string;
  size?: number;
};

