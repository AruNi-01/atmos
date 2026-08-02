"use client";

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

export const wsGithubApi = {
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
};
