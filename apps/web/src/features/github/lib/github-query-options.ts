"use client";

import { queryKeys } from "@/api/query/query-keys";
import {
  wsInfiniteQueryOptions,
  wsQueryOptions,
} from "@/api/query/computer-query-options";
import type { ComputerQueryScope } from "@/api/query/query-scope";
import { wsGithubApi, type GithubPrPayload } from "@/api/ws/github-api";
import { wsRequest } from "@/api/ws/request";
import type { BranchPr } from "@/features/github/lib/github-pr-cache";

type ConnectionState = "connecting" | "connected" | "disconnected" | "reconnecting";

export interface PrFile {
  sha: string;
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  changes: number;
  patch?: string;
}

export interface RepoPrListParams {
  owner: string;
  repo: string;
  state?: string;
  limit?: number;
}

export interface BranchPrListParams {
  owner: string;
  repo: string;
  branch: string;
  state?: string;
  emitBranchStatusRefresh?: boolean;
}

export interface GithubPrIdentityParams {
  owner: string;
  repo: string;
  prNumber: number;
}

export interface GithubActionsListParams {
  owner: string;
  repo: string;
  branch: string;
}

export interface GithubActionsDetailParams {
  owner: string;
  repo: string;
  runId: number;
}

export const GITHUB_PR_TIMELINE_PER_PAGE = 100;

export interface GithubPrTimelinePage {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  items: any[];
  has_more: boolean;
}

export function repoPrListQueryOptions(
  scope: ComputerQueryScope,
  connectionState: ConnectionState,
  params: RepoPrListParams,
  options?: { enabled?: boolean },
) {
  const { owner, repo, state, limit } = params;
  return wsQueryOptions({
    scope,
    connectionState,
    queryKey: queryKeys.computer.githubRepoPrList(scope, { owner, repo, state, limit }),
    queryFn: (): Promise<GithubPrPayload[]> =>
      wsGithubApi.listPrs({ owner, repo, state, limit }),
    // PR lists are small — keep across workspace hops (no full-screen reload).
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    enabled: (options?.enabled ?? true) && Boolean(owner && repo),
  });
}

export function branchPrListQueryOptions(
  scope: ComputerQueryScope,
  connectionState: ConnectionState,
  params: BranchPrListParams,
  options?: { enabled?: boolean },
) {
  const { owner, repo, branch, state, emitBranchStatusRefresh } = params;
  return wsQueryOptions({
    scope,
    connectionState,
    queryKey: queryKeys.computer.githubBranchPrList(scope, {
      owner,
      repo,
      branch,
      state,
      emitBranchStatusRefresh,
    }),
    queryFn: (): Promise<BranchPr[]> =>
      wsRequest<BranchPr[]>("github_pr_list", {
        owner,
        repo,
        branch,
        state,
        emit_branch_status_refresh: emitBranchStatusRefresh ?? false,
      }),
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    enabled: (options?.enabled ?? true) && Boolean(owner && repo && branch),
  });
}

export function githubPrDetailQueryOptions(
  scope: ComputerQueryScope,
  connectionState: ConnectionState,
  params: GithubPrIdentityParams,
  options?: { enabled?: boolean },
) {
  const { owner, repo, prNumber } = params;
  return wsQueryOptions({
    scope,
    connectionState,
    queryKey: queryKeys.computer.githubPrDetail(scope, { owner, repo, prNumber }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    queryFn: (): Promise<any> =>
      wsRequest("github_pr_detail", {
        owner,
        repo,
        pr_number: prNumber,
      }),
    staleTime: 60_000,
    enabled: (options?.enabled ?? true) && Boolean(owner && repo && prNumber),
  });
}

export function githubPrDetailSidebarQueryOptions(
  scope: ComputerQueryScope,
  connectionState: ConnectionState,
  params: GithubPrIdentityParams,
  options?: { enabled?: boolean },
) {
  const { owner, repo, prNumber } = params;
  return wsQueryOptions({
    scope,
    connectionState,
    queryKey: queryKeys.computer.githubPrDetailSidebar(scope, {
      owner,
      repo,
      prNumber,
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    queryFn: (): Promise<any> =>
      wsRequest("github_pr_detail_sidebar", {
        owner,
        repo,
        pr_number: prNumber,
      }),
    staleTime: 60_000,
    enabled: (options?.enabled ?? true) && Boolean(owner && repo && prNumber),
  });
}

export function githubPrFilesQueryOptions(
  scope: ComputerQueryScope,
  connectionState: ConnectionState,
  params: GithubPrIdentityParams,
  options?: { enabled?: boolean },
) {
  const { owner, repo, prNumber } = params;
  return wsQueryOptions({
    scope,
    connectionState,
    queryKey: queryKeys.computer.githubPrFiles(scope, { owner, repo, prNumber }),
    queryFn: async (): Promise<PrFile[]> => {
      const result = await wsRequest("github_pr_files", {
        owner,
        repo,
        pr_number: prNumber,
      });
      return Array.isArray(result) ? (result as PrFile[]) : [];
    },
    staleTime: 60_000,
    enabled: (options?.enabled ?? true) && Boolean(owner && repo && prNumber),
  });
}

export function githubPrTimelineInfiniteQueryOptions(
  scope: ComputerQueryScope,
  connectionState: ConnectionState,
  params: GithubPrIdentityParams,
  options?: { enabled?: boolean },
) {
  const { owner, repo, prNumber } = params;
  return wsInfiniteQueryOptions({
    scope,
    connectionState,
    queryKey: queryKeys.computer.githubPrTimeline(scope, { owner, repo, prNumber }),
    queryFn: async ({ pageParam }): Promise<GithubPrTimelinePage> => {
      const result = await wsRequest<GithubPrTimelinePage>("github_pr_timeline_page", {
        owner,
        repo,
        pr_number: prNumber,
        page: pageParam,
        per_page: GITHUB_PR_TIMELINE_PER_PAGE,
      });
      return {
        items: Array.isArray(result?.items) ? result.items : [],
        has_more: Boolean(result?.has_more),
      };
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage, _pages, lastPageParam) =>
      lastPage.has_more ? lastPageParam + 1 : undefined,
    staleTime: 60_000,
    enabled: (options?.enabled ?? true) && Boolean(owner && repo && prNumber),
  });
}

export function githubActionsListQueryOptions(
  scope: ComputerQueryScope,
  connectionState: ConnectionState,
  params: GithubActionsListParams,
  options?: { enabled?: boolean },
) {
  const { owner, repo, branch } = params;
  return wsQueryOptions({
    scope,
    connectionState,
    queryKey: queryKeys.computer.githubActionsList(scope, { owner, repo, branch }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    queryFn: async (): Promise<any[]> => {
      const result = await wsRequest("github_actions_list", { owner, repo, branch });
      return Array.isArray(result) ? result : [];
    },
    // List is small; keep Query cache warm while session snapshot owns hop paint.
    staleTime: 60_000,
    gcTime: 30 * 60_000,
    enabled: (options?.enabled ?? true) && Boolean(owner && repo && branch),
  });
}

export function githubActionsDetailQueryOptions(
  scope: ComputerQueryScope,
  connectionState: ConnectionState,
  params: GithubActionsDetailParams,
  options?: { enabled?: boolean },
) {
  const { owner, repo, runId } = params;
  return wsQueryOptions({
    scope,
    connectionState,
    queryKey: queryKeys.computer.githubActionsDetail(scope, { owner, repo, runId }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    queryFn: (): Promise<any> =>
      wsRequest("github_actions_detail", { owner, repo, run_id: runId }),
    staleTime: 30_000, // 30s
    enabled: (options?.enabled ?? true) && Boolean(owner && repo && runId),
  });
}

export function githubCiStatusQueryOptions(
  scope: ComputerQueryScope,
  connectionState: ConnectionState,
  params: GithubActionsListParams, // re-use for branch
  options?: { enabled?: boolean },
) {
  const { owner, repo, branch } = params;
  return wsQueryOptions({
    scope,
    connectionState,
    queryKey: queryKeys.computer.githubCiStatus(scope, { owner, repo, branch }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    queryFn: (): Promise<any> =>
      wsRequest("github_ci_status", { owner, repo, branch }),
    staleTime: 30_000, // 30s
    enabled: (options?.enabled ?? true) && Boolean(owner && repo && branch),
  });
}
