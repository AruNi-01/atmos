"use client";

import type { GithubRateLimitPayload } from "@atmos/api-types/ws/dto/github";
import { wsRequest } from "@/api/ws/request";

export interface GithubIssueLabelPayload {
  name: string;
  color: string | null;
  description: string | null;
}

export interface GithubIssueAssigneePayload {
  login: string;
  avatar_url?: string | null;
}

export interface GithubIssuePayload {
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
}

export interface GithubPrPayload {
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
}

export interface GithubLinkedPrPayload {
  number: number;
  title: string;
  url: string;
  state: string;
  headRefName?: string;
}

export interface GithubPage<T> {
  items: T[];
  has_more: boolean;
}

export interface GithubStatusCheckPayload {
  state?: string | null;
  conclusion?: string | null;
  status?: string | null;
  name?: string | null;
  context?: string | null;
  details_url?: string | null;
  target_url?: string | null;
  workflow_name?: string | null;
}

export interface GithubSearchItemPayload {
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
  kind: string;
  /** PR CI rollup for list rings (empty for issues). */
  status_checks?: GithubStatusCheckPayload[];
  /** Linked issues (on PR rows) or linked PRs (on issue rows). */
  linked_refs?: GithubLinkedRefPayload[];
}

export interface GithubLinkedRefPayload {
  /** `"issue"` | `"pr"` */
  kind: string;
  number: number;
  state?: string | null;
  title?: string | null;
  url?: string | null;
}

export interface GithubSearchPagePayload {
  items: GithubSearchItemPayload[];
  has_more: boolean;
  total_count: number;
}

export interface GithubIssueTemplateFilePayload {
  name: string;
  content: string;
}

export interface GithubSecurityPolicyPayload {
  path: string;
  content: string;
  html_url?: string | null;
}

export interface GithubIssueTemplatesPayload {
  files: GithubIssueTemplateFilePayload[];
  security_policy?: GithubSecurityPolicyPayload | null;
}

export interface GithubIssueCreatePayload {
  number?: number | null;
  url: string;
}

export const wsGithubApi = {
  search: (params: {
    kind: "issue" | "pr";
    repos: Array<{ owner: string; repo: string }>;
    state?: "all" | "open" | "closed";
    assignees?: string[];
    labels?: string[];
    /** Free-form GitHub search syntax (e.g. `sort:created-desc author:octocat`). */
    query?: string | null;
    page?: number;
    perPage?: number;
  }): Promise<GithubSearchPagePayload> =>
    wsRequest<GithubSearchPagePayload>("github_search", {
      kind: params.kind,
      repos: params.repos,
      state: params.state ?? "all",
      assignees: params.assignees ?? [],
      labels: params.labels ?? [],
      query: params.query?.trim() || null,
      page: params.page ?? 1,
      per_page: params.perPage ?? 20,
    }),

  listIssueTemplates: (params: {
    owner: string;
    repo: string;
  }): Promise<GithubIssueTemplatesPayload> =>
    wsRequest<GithubIssueTemplatesPayload>("github_issue_templates", {
      owner: params.owner,
      repo: params.repo,
    }),

  createIssue: (params: {
    owner: string;
    repo: string;
    title: string;
    body?: string | null;
    labels?: string[];
    assignees?: string[];
  }): Promise<GithubIssueCreatePayload> =>
    wsRequest<GithubIssueCreatePayload>("github_issue_create", {
      owner: params.owner,
      repo: params.repo,
      title: params.title,
      body: params.body ?? null,
      labels: params.labels ?? [],
      assignees: params.assignees ?? [],
    }),

  listIssuePage: (params: {
    owner: string; repo: string; state: "open" | "closed"; page: number; perPage: number;
  }): Promise<GithubPage<GithubIssuePayload>> =>
    wsRequest<GithubPage<GithubIssuePayload>>("github_issue_page", {
      owner: params.owner, repo: params.repo, state: params.state, page: params.page, per_page: params.perPage,
      sort: "updated", direction: "desc",
    }),

  listIssues: async (params: {
    owner: string;
    repo: string;
    state?: string;
    limit?: number;
    sort?: "created" | "updated";
    direction?: "asc" | "desc";
    search?: string;
  }): Promise<GithubIssuePayload[]> => {
    return wsRequest<GithubIssuePayload[]>("github_issue_list", {
      owner: params.owner,
      repo: params.repo,
      state: params.state ?? "open",
      limit: params.limit ?? 50,
      sort: params.sort ?? "created",
      direction: params.direction ?? "desc",
      search: params.search?.trim() || null,
    });
  },

  getIssue: async (params:
    | { owner: string; repo: string; issueNumber: number; issueUrl?: undefined }
    | { issueUrl: string; owner?: undefined; repo?: undefined; issueNumber?: undefined },
  ): Promise<GithubIssuePayload> => {
    return wsRequest<GithubIssuePayload>("github_issue_get", {
      owner: params.owner ?? null,
      repo: params.repo ?? null,
      issue_number: params.issueNumber ?? null,
      issue_url: params.issueUrl ?? null,
    });
  },

  listPrs: async (params: {
    owner: string;
    repo: string;
    state?: string;
    limit?: number;
  }): Promise<GithubPrPayload[]> => {
    return wsRequest<GithubPrPayload[]>("github_pr_list_repo", {
      owner: params.owner,
      repo: params.repo,
      state: params.state ?? "open",
      limit: params.limit ?? 50,
    });
  },

  listBranchPrPage: (params: {
    owner: string; repo: string; branch: string; state: string; page: number; perPage: number;
  }): Promise<GithubPage<Record<string, unknown>>> =>
    wsRequest<GithubPage<Record<string, unknown>>>("github_pr_branch_page", {
      owner: params.owner, repo: params.repo, branch: params.branch, state: params.state,
      page: params.page, per_page: params.perPage,
    }),

  getPr: async (params:
    | { owner: string; repo: string; prNumber: number; prUrl?: undefined }
    | { prUrl: string; owner?: undefined; repo?: undefined; prNumber?: undefined },
  ): Promise<GithubPrPayload> => {
    return wsRequest<GithubPrPayload>("github_pr_get", {
      owner: params.owner ?? null,
      repo: params.repo ?? null,
      pr_number: params.prNumber ?? null,
      pr_url: params.prUrl ?? null,
    });
  },

  listIssueLinkedPrs: async (params: {
    owner: string;
    repo: string;
    issueNumber: number;
  }): Promise<GithubLinkedPrPayload[]> => {
    return wsRequest<GithubLinkedPrPayload[]>("github_issue_linked_prs", {
      owner: params.owner,
      repo: params.repo,
      issue_number: params.issueNumber,
    });
  },

  /** REST core / Search / GraphQL rate limits for the local `gh` auth token. */
  getRateLimit: (): Promise<GithubRateLimitPayload> =>
    wsRequest<GithubRateLimitPayload>("github_rate_limit", {}),
};
