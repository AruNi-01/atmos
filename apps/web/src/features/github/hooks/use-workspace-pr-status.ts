"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { GithubPrPayload } from "@/api/ws/github-api";
import { useComputerQueryScope } from "@/api/query/query-scope";
import { useWebSocketStore } from "@/features/connection/hooks/use-websocket";
import { useBranchPrListQuery } from "@/features/github/hooks/use-github-pr-query";
import { githubPrDetailQueryOptions } from "@/features/github/lib/github-query-options";
import {
  extractStatusChecks,
  hasRunningChecks,
  resolveWorkspacePrPresentation,
  type WorkspacePrPresentation,
} from "@/features/github/lib/workspace-pr-status";

const CHECKS_POLL_MS = 60_000;

export type UseWorkspacePrStatusOptions = {
  /** Managed PR snapshot stored on the workspace (create-from-PR / linked). */
  githubPr?: GithubPrPayload | null;
  /** Workspace branch — used to align with header branch-PR cache keys. */
  branch?: string | null;
  /**
   * User is actively looking at this row (hover / popover / selection).
   * Kept for call-site compatibility; list rows already hydrate PR detail
   * asynchronously on mount so icons are not stuck on the bootstrap snapshot.
   */
  interested?: boolean;
};

export type WorkspacePrStatusSnapshot = {
  /** Null when the workspace does not manage a PR. */
  presentation: WorkspacePrPresentation | null;
  /** True while a network fetch for PR detail is in flight (no cached data yet). */
  isLoadingChecks: boolean;
};

/**
 * Shared PR lifecycle + checks presentation for workspace list surfaces.
 *
 * Data reuse:
 * - Branch PR list is observed with `enabled: false` so header / overview
 *   fetches populate state without a second request.
 * - PR detail (statusCheckRollup) reuses the same TanStack key as the PR
 *   center tab.
 *
 * Hydration:
 * - Managed PRs fetch detail asynchronously as soon as the row mounts (does
 *   not block the workspace list — first paint uses `githubPr` snapshot).
 * - While checks are still running, poll every minute.
 * - Hover / selection still shares the same cache (no extra fetch when warm).
 */
export function useWorkspacePrStatus(
  options: UseWorkspacePrStatusOptions,
): WorkspacePrStatusSnapshot {
  const managed = options.githubPr ?? null;
  const owner = managed?.owner ?? "";
  const repo = managed?.repo ?? "";
  const prNumber = managed?.number ?? 0;
  const headRef = (managed?.head_ref || options.branch || "").trim();

  const scope = useComputerQueryScope();
  const connectionState = useWebSocketStore((s) => s.connectionState);

  // Cache-only observer — same key shape as Header's useGithubPRList(state: "all").
  // Does not trigger network; reuses header/overview data when present.
  const branchPrQuery = useBranchPrListQuery({
    owner,
    repo,
    branch: headRef,
    state: "all",
    enabled: false,
  });

  const canQueryDetail = Boolean(managed && owner && repo && prNumber);
  const detailQuery = useQuery({
    ...githubPrDetailQueryOptions(
      scope,
      connectionState,
      { owner, repo, prNumber },
      // Async hydrate for every managed-PR row. List paints immediately from
      // the bootstrap snapshot; icons/checks update when this settles.
      { enabled: canQueryDetail },
    ),
    refetchInterval: (query) => {
      const checks = extractStatusChecks(query.state.data);
      return hasRunningChecks(checks) ? CHECKS_POLL_MS : false;
    },
  });

  const branchPr = useMemo(() => {
    if (!managed || !Array.isArray(branchPrQuery.data)) return null;
    return (
      branchPrQuery.data.find(
        (pr) => Number(pr.number) === managed.number,
      ) ?? null
    );
  }, [branchPrQuery.data, managed]);

  const presentation = useMemo(() => {
    if (!managed) return null;
    return resolveWorkspacePrPresentation({
      managed,
      branchPr,
      detail: detailQuery.data ?? null,
    });
  }, [branchPr, detailQuery.data, managed]);

  return {
    presentation,
    isLoadingChecks:
      canQueryDetail && detailQuery.isFetching && detailQuery.data == null,
  };
}
