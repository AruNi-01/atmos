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
import type {
  GithubActionsDetailPayload,
  GithubActionsRunPayload,
} from "@atmos/api-types/ws/dto/github";

type ConnectionState = "connecting" | "connected" | "disconnected" | "reconnecting";

export interface PrFile {
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
  /** Derived client-side after normalize — not from GitHub JSON. */
  kind?: "text" | "binary" | "too_large";
  preview_kind?: "none" | "image" | "media";
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

export interface GithubRepoLabel {
  name: string;
  color?: string | null;
  description?: string | null;
}

export interface GithubRepoAssignee {
  login: string;
  avatar_url?: string | null;
}

export interface GithubRepoLabelsParams {
  owner: string;
  repo: string;
  limit?: number;
}

export interface GithubRepoAssigneesParams {
  owner: string;
  repo: string;
}

export function githubRepoLabelsQueryOptions(
  scope: ComputerQueryScope,
  connectionState: ConnectionState,
  params: GithubRepoLabelsParams,
  options?: { enabled?: boolean },
) {
  const { owner, repo, limit = 200 } = params;
  return wsQueryOptions({
    scope,
    connectionState,
    queryKey: queryKeys.computer.githubRepoLabels(scope, { owner, repo, limit }),
    queryFn: (): Promise<GithubRepoLabel[]> =>
      wsRequest<GithubRepoLabel[]>("github_repo_labels", {
        owner,
        repo,
        limit,
      }),
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    enabled: (options?.enabled ?? true) && Boolean(owner && repo),
  });
}

export function githubRepoAssigneesQueryOptions(
  scope: ComputerQueryScope,
  connectionState: ConnectionState,
  params: GithubRepoAssigneesParams,
  options?: { enabled?: boolean },
) {
  const { owner, repo } = params;
  return wsQueryOptions({
    scope,
    connectionState,
    queryKey: queryKeys.computer.githubRepoAssignees(scope, { owner, repo }),
    queryFn: (): Promise<GithubRepoAssignee[]> =>
      wsRequest<GithubRepoAssignee[]>("github_repo_assignees", {
        owner,
        repo,
      }),
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    enabled: (options?.enabled ?? true) && Boolean(owner && repo),
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
      if (!Array.isArray(result)) return [];
      const { classifyPrFileWithoutPatch } = await import(
        "@/features/diff/lib/diff-content-kind"
      );
      return (result as PrFile[]).map((file) => {
        if (file.patch) {
          return { ...file, kind: "text" as const, preview_kind: "none" as const };
        }
        const classified = classifyPrFileWithoutPatch(file.filename);
        return { ...file, ...classified };
      });
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
    queryFn: async (): Promise<GithubActionsRunPayload[]> => {
      const result = await wsRequest("github_actions_list", { owner, repo, branch });
      return Array.isArray(result) ? result : [];
    },
    // Completed runs rarely change. In-progress runs still poll every 30 seconds.
    staleTime: 5 * 60_000,
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
    queryFn: (): Promise<GithubActionsDetailPayload> =>
      wsRequest("github_actions_detail", { owner, repo, run_id: runId }),
    // A completed run's jobs, annotations, artifacts, and workflow source are immutable.
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
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
    // Pending runs still poll every 30 seconds through useGithubCIStatus.
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    enabled: (options?.enabled ?? true) && Boolean(owner && repo && branch),
  });
}

export function githubCommitDetailQueryOptions(
  scope: ComputerQueryScope,
  connectionState: ConnectionState,
  params: { owner: string; repo: string; sha: string },
  options?: { enabled?: boolean },
) {
  const { owner, repo, sha } = params;
  return wsQueryOptions({
    scope,
    connectionState,
    queryKey: queryKeys.computer.githubCommitDetail(scope, { owner, repo, sha }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    queryFn: async (): Promise<any> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result: any = await wsRequest("github_commit_detail", { owner, repo, sha });
      if (!result || typeof result !== "object") return null;
      // Classify files like PR files
      const files = Array.isArray(result.files) ? result.files : [];
      const { classifyPrFileWithoutPatch } = await import(
        "@/features/diff/lib/diff-content-kind"
      );
      const classifiedFiles = (files as PrFile[]).map((file) => {
        if (file.patch) {
          return { ...file, kind: "text" as const, preview_kind: "none" as const };
        }
        const classified = classifyPrFileWithoutPatch(file.filename);
        return { ...file, ...classified };
      });
      return { ...result, files: classifiedFiles };
    },
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    enabled: (options?.enabled ?? true) && Boolean(owner && repo && sha),
  });
}
