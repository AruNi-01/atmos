"use client";

import { wsRequest } from "@/api/ws/request";

export interface GithubIssueLabelPayload {
  name: string;
  color: string | null;
  description: string | null;
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
  labels: GithubIssueLabelPayload[];
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

export const wsGithubApi = {
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
};
