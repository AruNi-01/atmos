"use client";

import { queryKeys } from "@/api/query/query-keys";
import { wsQueryOptions } from "@/api/query/computer-query-options";
import type { ComputerQueryScope } from "@/api/query/query-scope";
import { wsGithubApi, type GithubPrPayload } from "@/api/ws/github-api";
import { wsRequest } from "@/api/ws/request";
import type { BranchPr } from "@/features/github/lib/github-pr-cache";

type ConnectionState = "connecting" | "connected" | "disconnected" | "reconnecting";

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
    staleTime: 5 * 60_000, // 5 min — matches the legacy TTL
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
    enabled: (options?.enabled ?? true) && Boolean(owner && repo && branch),
  });
}
