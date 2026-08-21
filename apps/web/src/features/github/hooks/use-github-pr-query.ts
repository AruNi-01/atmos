"use client";

import { useEffect, useMemo } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useComputerQueryScope } from "@/api/query/query-scope";
import { useWebSocketStore } from "@/features/connection/hooks/use-websocket";
import { queryKeys } from "@/api/query/query-keys";
import {
  repoPrListQueryOptions,
  githubIssueListQueryOptions,
  githubIssuePageQueryOptions,
  githubIssueDetailQueryOptions,
  githubIssueTimelineInfiniteQueryOptions,
  githubIssueLinkedPrsQueryOptions,
  branchPrListQueryOptions,
  branchPrPageQueryOptions,
  githubPrDetailQueryOptions,
  githubPrDetailSidebarQueryOptions,
  githubRepoLabelsQueryOptions,
  githubRepoAssigneesQueryOptions,
  githubRateLimitQueryOptions,
  githubPrFilesQueryOptions,
  githubPrTimelineInfiniteQueryOptions,
  githubActionsListQueryOptions,
  githubActionsDetailQueryOptions,
  githubActionsJobLogsQueryOptions,
  githubCiStatusQueryOptions,
  githubCommitDetailQueryOptions,
  type RepoPrListParams,
  type GithubIssueListParams,
  type GithubIssuePageParams,
  type GithubIssueIdentityParams,
  type BranchPrListParams,
  type BranchPrPageParams,
  type GithubPrIdentityParams,
  type GithubRepoLabelsParams,
  type GithubRepoAssigneesParams,
  type GithubActionsListParams,
  type GithubActionsDetailParams,
  type GithubActionsJobLogsParams,
} from "@/features/github/lib/github-query-options";
import { useSessionListQuery } from "@/features/workspace/hooks/use-session-list-query";
import { sessionListKeys } from "@/features/workspace/store/session-list-snapshot-store";

export function useRepoPrListQuery(params: RepoPrListParams & { enabled?: boolean }) {
  const scope = useComputerQueryScope();
  const connectionState = useWebSocketStore((s) => s.connectionState);
  const { enabled = true, ...restParams } = params;

  return useQuery(
    repoPrListQueryOptions(scope, connectionState, restParams, {
      enabled: enabled && Boolean(params.owner && params.repo),
    }),
  );
}

export function useGithubIssueListQuery(params: GithubIssueListParams & { enabled?: boolean }) {
  const scope = useComputerQueryScope();
  const connectionState = useWebSocketStore((s) => s.connectionState);
  const { enabled = true, ...restParams } = params;
  return useQuery(githubIssueListQueryOptions(scope, connectionState, restParams, {
    enabled: enabled && Boolean(params.owner && params.repo),
  }));
}

export function useGithubIssuePageQuery(params: GithubIssuePageParams & { enabled?: boolean }) {
  const scope = useComputerQueryScope();
  const connectionState = useWebSocketStore((s) => s.connectionState);
  const { enabled = true, ...restParams } = params;
  return useQuery(githubIssuePageQueryOptions(scope, connectionState, restParams, {
    enabled: enabled && Boolean(params.owner && params.repo),
  }));
}

export function useGithubIssueDetailQuery(params: GithubIssueIdentityParams & { enabled?: boolean }) {
  const scope = useComputerQueryScope();
  const connectionState = useWebSocketStore((s) => s.connectionState);
  const { enabled = true, ...restParams } = params;
  return useQuery(githubIssueDetailQueryOptions(scope, connectionState, restParams, {
    enabled: enabled && Boolean(params.owner && params.repo && params.issueNumber),
  }));
}

export function useGithubIssueTimelineInfiniteQuery(params: GithubIssueIdentityParams & { enabled?: boolean }) {
  const scope = useComputerQueryScope();
  const connectionState = useWebSocketStore((s) => s.connectionState);
  const { enabled = true, ...restParams } = params;
  return useInfiniteQuery(githubIssueTimelineInfiniteQueryOptions(scope, connectionState, restParams, {
    enabled: enabled && Boolean(params.owner && params.repo && params.issueNumber),
  }));
}

export function useGithubIssueLinkedPrsQuery(params: GithubIssueIdentityParams & { enabled?: boolean }) {
  const scope = useComputerQueryScope();
  const connectionState = useWebSocketStore((s) => s.connectionState);
  const { enabled = true, ...restParams } = params;
  return useQuery(githubIssueLinkedPrsQueryOptions(scope, connectionState, restParams, {
    enabled: enabled && Boolean(params.owner && params.repo && params.issueNumber),
  }));
}

export function useBranchPrListQuery(params: BranchPrListParams & { enabled?: boolean }) {
  const scope = useComputerQueryScope();
  const connectionState = useWebSocketStore((s) => s.connectionState);
  const { enabled = true, ...restParams } = params;
  const sessionKey =
    params.owner && params.repo && params.branch
      ? sessionListKeys.branchPrList({
          owner: params.owner,
          repo: params.repo,
          branch: params.branch,
          state: params.state,
          emitBranchStatusRefresh: params.emitBranchStatusRefresh,
        })
      : null;

  return useSessionListQuery(
    sessionKey,
    branchPrListQueryOptions(scope, connectionState, restParams, {
      enabled: enabled && Boolean(params.owner && params.repo && params.branch),
    }),
  );
}

export function useBranchPrPageQuery(params: BranchPrPageParams & { enabled?: boolean }) {
  const scope = useComputerQueryScope();
  const connectionState = useWebSocketStore((s) => s.connectionState);
  const { enabled = true, ...restParams } = params;
  return useQuery(branchPrPageQueryOptions(scope, connectionState, restParams, {
    enabled: enabled && Boolean(params.owner && params.repo && params.branch),
  }));
}

export function useGithubPrDetailQuery(params: GithubPrIdentityParams & { enabled?: boolean }) {
  const scope = useComputerQueryScope();
  const connectionState = useWebSocketStore((s) => s.connectionState);
  const { enabled = true, ...restParams } = params;

  return useQuery(
    githubPrDetailQueryOptions(scope, connectionState, restParams, {
      enabled: enabled && Boolean(params.owner && params.repo && params.prNumber),
    }),
  );
}

export function useGithubPrDetailSidebarQuery(
  params: GithubPrIdentityParams & { enabled?: boolean },
) {
  const scope = useComputerQueryScope();
  const connectionState = useWebSocketStore((s) => s.connectionState);
  const { enabled = true, ...restParams } = params;

  return useQuery(
    githubPrDetailSidebarQueryOptions(scope, connectionState, restParams, {
      enabled: enabled && Boolean(params.owner && params.repo && params.prNumber),
    }),
  );
}

export function useGithubRepoLabelsQuery(
  params: GithubRepoLabelsParams & { enabled?: boolean },
) {
  const scope = useComputerQueryScope();
  const connectionState = useWebSocketStore((s) => s.connectionState);
  const { enabled = true, ...restParams } = params;

  return useQuery(
    githubRepoLabelsQueryOptions(scope, connectionState, restParams, {
      enabled: enabled && Boolean(params.owner && params.repo),
    }),
  );
}

export function useGithubRepoAssigneesQuery(
  params: GithubRepoAssigneesParams & { enabled?: boolean },
) {
  const scope = useComputerQueryScope();
  const connectionState = useWebSocketStore((s) => s.connectionState);
  const { enabled = true, ...restParams } = params;

  return useQuery(
    githubRepoAssigneesQueryOptions(scope, connectionState, restParams, {
      enabled: enabled && Boolean(params.owner && params.repo),
    }),
  );
}

export { useGithubUserCardQuery } from "@/features/github/hooks/use-github-user-card-query";

export function useGithubRateLimitQuery(options?: { enabled?: boolean }) {
  const scope = useComputerQueryScope();
  const connectionState = useWebSocketStore((s) => s.connectionState);

  return useQuery(
    githubRateLimitQueryOptions(scope, connectionState, {
      enabled: options?.enabled ?? true,
    }),
  );
}

export function useGithubPrFilesQuery(params: GithubPrIdentityParams & { enabled?: boolean }) {
  const scope = useComputerQueryScope();
  const connectionState = useWebSocketStore((s) => s.connectionState);
  const { enabled = true, ...restParams } = params;

  return useQuery(
    githubPrFilesQueryOptions(scope, connectionState, restParams, {
      enabled: enabled && Boolean(params.owner && params.repo && params.prNumber),
    }),
  );
}

export function useGithubPrTimelineInfiniteQuery(
  params: GithubPrIdentityParams & { enabled?: boolean },
) {
  const scope = useComputerQueryScope();
  const connectionState = useWebSocketStore((s) => s.connectionState);
  const { enabled = true, ...restParams } = params;

  const query = useInfiniteQuery(
    githubPrTimelineInfiniteQueryOptions(scope, connectionState, restParams, {
      enabled: enabled && Boolean(params.owner && params.repo && params.prNumber),
    }),
  );

  // Preserve legacy auto-chain: keep fetching until has_more is false.
  useEffect(() => {
    if (!enabled) return;
    if (query.hasNextPage && !query.isFetchingNextPage && !query.isLoading) {
      void query.fetchNextPage();
    }
  }, [
    enabled,
    query.fetchNextPage,
    query.hasNextPage,
    query.isFetchingNextPage,
    query.isLoading,
  ]);

  const items = useMemo(
    () => query.data?.pages.flatMap((page) => page.items) ?? [],
    [query.data],
  );

  return {
    ...query,
    items,
  };
}

/** Imperatively invalidate GitHub PR queries (e.g. after a PR mutation). */
export function useInvalidateGithubPrs() {
  const queryClient = useQueryClient();
  const scope = useComputerQueryScope();

  return (params?: { owner?: string; repo?: string; prNumber?: number }) => {
    if (params?.owner && params?.repo && params.prNumber) {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.computer.githubPrDetail(scope, {
          owner: params.owner,
          repo: params.repo,
          prNumber: params.prNumber,
        }),
        refetchType: "active",
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.computer.githubPrDetailSidebar(scope, {
          owner: params.owner,
          repo: params.repo,
          prNumber: params.prNumber,
        }),
        refetchType: "active",
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.computer.githubPrFiles(scope, {
          owner: params.owner,
          repo: params.repo,
          prNumber: params.prNumber,
        }),
        refetchType: "active",
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.computer.githubPrTimeline(scope, {
          owner: params.owner,
          repo: params.repo,
          prNumber: params.prNumber,
        }),
        refetchType: "active",
      });
    }

    if (params?.owner && params?.repo) {
      void queryClient.invalidateQueries({
        queryKey: [...queryKeys.computer.root(scope), "github", "repoPrs", params.owner, params.repo],
        refetchType: "active",
      });
      void queryClient.invalidateQueries({
        queryKey: [...queryKeys.computer.root(scope), "github", "branchPrs", params.owner, params.repo],
        refetchType: "active",
      });
      return;
    }
    void queryClient.invalidateQueries({
      queryKey: [...queryKeys.computer.root(scope), "github"],
      refetchType: "active",
    });
  };
}

export function useGithubActionsListQuery(params: GithubActionsListParams & { enabled?: boolean }) {
  const scope = useComputerQueryScope();
  const connectionState = useWebSocketStore((s) => s.connectionState);
  const { enabled = true, ...restParams } = params;
  const sessionKey =
    params.owner && params.repo && params.branch
      ? sessionListKeys.githubActionsList({
          owner: params.owner,
          repo: params.repo,
          branch: params.branch,
        })
      : null;

  return useSessionListQuery(
    sessionKey,
    githubActionsListQueryOptions(scope, connectionState, restParams, {
      enabled: enabled && Boolean(params.owner && params.repo && params.branch),
    }),
  );
}

export function useGithubActionsDetailQuery(params: GithubActionsDetailParams & { enabled?: boolean }) {
  const scope = useComputerQueryScope();
  const connectionState = useWebSocketStore((s) => s.connectionState);
  const { enabled = true, ...restParams } = params;

  return useQuery(
    githubActionsDetailQueryOptions(scope, connectionState, restParams, {
      enabled: enabled && Boolean(params.owner && params.repo && params.runId),
    }),
  );
}

export function useGithubActionsJobLogsQuery(
  params: GithubActionsJobLogsParams & { enabled?: boolean },
) {
  const scope = useComputerQueryScope();
  const connectionState = useWebSocketStore((s) => s.connectionState);
  const { enabled = true, ...restParams } = params;

  return useQuery(
    githubActionsJobLogsQueryOptions(scope, connectionState, restParams, {
      enabled: enabled && Boolean(params.owner && params.repo && params.jobId),
    }),
  );
}

export function useGithubCiStatusQuery(params: GithubActionsListParams & { enabled?: boolean }) {
  const scope = useComputerQueryScope();
  const connectionState = useWebSocketStore((s) => s.connectionState);
  const { enabled = true, ...restParams } = params;

  return useQuery(
    githubCiStatusQueryOptions(scope, connectionState, restParams, {
      enabled: enabled && Boolean(params.owner && params.repo && params.branch),
    }),
  );
}

export function useGithubCommitDetailQuery(
  params: { owner: string; repo: string; sha: string } & { enabled?: boolean },
) {
  const scope = useComputerQueryScope();
  const connectionState = useWebSocketStore((s) => s.connectionState);
  const { enabled = true, ...restParams } = params;

  return useQuery(
    githubCommitDetailQueryOptions(scope, connectionState, restParams, {
      enabled: enabled && Boolean(params.owner && params.repo && params.sha),
    }),
  );
}

export function useInvalidateGithubActions() {
  const queryClient = useQueryClient();
  const scope = useComputerQueryScope();

  return (params?: { owner?: string; repo?: string; branch?: string; runId?: number }) => {
    if (params?.owner && params?.repo) {
      if (params.runId) {
        void queryClient.invalidateQueries({
          queryKey: queryKeys.computer.githubActionsDetail(scope, {
            owner: params.owner,
            repo: params.repo,
            runId: params.runId,
          }),
          refetchType: "active",
        });
      }
      if (params.branch) {
        void queryClient.invalidateQueries({
          queryKey: queryKeys.computer.githubActionsList(scope, {
            owner: params.owner,
            repo: params.repo,
            branch: params.branch,
          }),
          refetchType: "active",
        });
        void queryClient.invalidateQueries({
          queryKey: queryKeys.computer.githubCiStatus(scope, {
            owner: params.owner,
            repo: params.repo,
            branch: params.branch,
          }),
          refetchType: "active",
        });
      }
      // Also invalidate all github if no specific runId/branch provided?
      // Actually invalidating specific is enough.
      return;
    }
    
    // Fallback: invalidate everything github actions related
    void queryClient.invalidateQueries({
      queryKey: [...queryKeys.computer.root(scope), "github", "actionsList"],
      refetchType: "active",
    });
    void queryClient.invalidateQueries({
      queryKey: [...queryKeys.computer.root(scope), "github", "actionsDetail"],
      refetchType: "active",
    });
    void queryClient.invalidateQueries({
      queryKey: [...queryKeys.computer.root(scope), "github", "ciStatus"],
      refetchType: "active",
    });
  };
}

