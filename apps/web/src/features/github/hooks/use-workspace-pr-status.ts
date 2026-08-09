"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { GithubPrPayload } from "@/api/ws/github-api";
import { useComputerQueryScope } from "@/api/query/query-scope";
import { useWebSocketStore } from "@/features/connection/hooks/use-websocket";
import { useGitStatusQuery } from "@/features/git/hooks/use-git-status-query";
import {
  useBranchPrListQuery,
  useRepoPrListQuery,
} from "@/features/github/hooks/use-github-pr-query";
import { githubPrDetailQueryOptions } from "@/features/github/lib/github-query-options";
import type { BranchPr } from "@/features/github/lib/github-pr-cache";
import {
  extractStatusChecks,
  hasRunningChecks,
  resolveWorkspacePrPresentation,
  type WorkspacePrPresentation,
} from "@/features/github/lib/workspace-pr-status";
import { normalizeGitBranchName } from "@/features/task/lib/find-linked-workspace";

const CHECKS_POLL_MS = 60_000;

export type UseWorkspacePrStatusOptions = {
  /** Managed PR snapshot stored on the workspace (create-from-PR / linked). */
  githubPr?: GithubPrPayload | null;
  /** Workspace branch — used to align with header branch-PR cache keys. */
  branch?: string | null;
  /**
   * Project or workspace path for git status (github_owner / github_repo).
   * Used when `githubPr` is missing so we can resolve PR by branch like Header.
   */
  repoPath?: string | null;
  /** Optional explicit owner/repo (skips git status when both set). */
  owner?: string | null;
  repo?: string | null;
  /**
   * User is actively looking at this row (hover / popover / selection).
   * Kept for call-site compatibility.
   */
  interested?: boolean;
};

export type WorkspacePrStatusSnapshot = {
  /** Null when the workspace does not manage / resolve a PR. */
  presentation: WorkspacePrPresentation | null;
  /** True while a network fetch for PR list/detail is in flight (no data yet). */
  isLoadingChecks: boolean;
};

type HeadBranchPrLike = {
  number: number;
  title?: string | null;
  state?: string | null;
  url?: string | null;
  head_ref?: string | null;
  headRefName?: string | null;
  base_ref?: string | null;
  baseRefName?: string | null;
  is_draft?: boolean | null;
  isDraft?: boolean | null;
};

function headNameOf(pr: HeadBranchPrLike): string {
  return normalizeGitBranchName(pr.head_ref || pr.headRefName);
}

/**
 * Pick the newest PR whose head branch matches `branch` (header parity).
 */
export function pickBranchHeadPr(
  prs: HeadBranchPrLike[] | null | undefined,
  branch: string | null | undefined,
): HeadBranchPrLike | null {
  const head = normalizeGitBranchName(branch);
  if (!head || !Array.isArray(prs) || prs.length === 0) return null;
  const matches = prs.filter((pr) => headNameOf(pr) === head);
  if (matches.length === 0) return null;
  return matches.reduce((latest, pr) =>
    Number(pr.number) > Number(latest.number) ? pr : latest,
  );
}

function toManagedPayload(
  owner: string,
  repo: string,
  pr: HeadBranchPrLike,
): GithubPrPayload {
  const number = Number(pr.number);
  const head = String(pr.head_ref || pr.headRefName || "").trim();
  const base = String(pr.base_ref || pr.baseRefName || "").trim();
  return {
    owner,
    repo,
    number,
    title: String(pr.title ?? "").trim() || `Pull request #${number}`,
    body: null,
    url: String(pr.url ?? `https://github.com/${owner}/${repo}/pull/${number}`),
    state: String(pr.state ?? "open"),
    head_ref: head,
    base_ref: base,
    is_draft: Boolean(pr.is_draft ?? pr.isDraft),
    labels: [],
  };
}

/**
 * Shared PR lifecycle + checks presentation for workspace list surfaces.
 *
 * - Stored `githubPr` → paint from snapshot; hydrate detail async; merge branch
 *   list cache when available (Header key).
 * - Missing `githubPr` → resolve via **repo-level** PR list (one query per
 *   owner/repo, shared by all rows) filtered by head branch — same rule as
 *   Header (`headRefName === branch`, highest number wins).
 */
export function useWorkspacePrStatus(
  options: UseWorkspacePrStatusOptions,
): WorkspacePrStatusSnapshot {
  const stored = options.githubPr ?? null;
  const branch = (options.branch ?? stored?.head_ref ?? "").trim();
  const queryBranch = (stored?.head_ref || branch).trim();
  const headRef = normalizeGitBranchName(queryBranch);

  const needsRemote = !stored?.owner?.trim() || !stored?.repo?.trim();
  const hasExplicitRemote = Boolean(options.owner?.trim() && options.repo?.trim());
  const statusPath =
    needsRemote && !hasExplicitRemote
      ? options.repoPath?.trim() || null
      : null;
  const statusQuery = useGitStatusQuery(statusPath);

  const owner = (
    stored?.owner ||
    options.owner ||
    statusQuery.data?.github_owner ||
    ""
  ).trim();
  const repo = (
    stored?.repo ||
    options.repo ||
    statusQuery.data?.github_repo ||
    ""
  ).trim();

  const scope = useComputerQueryScope();
  const connectionState = useWebSocketStore((s) => s.connectionState);

  // Discover branch→PR for workspaces without stored githubPr.
  // Repo-level list is shared across all rows of the same project (cheap).
  const shouldDiscoverByBranch = !stored && Boolean(owner && repo && headRef);
  const repoPrQuery = useRepoPrListQuery({
    owner,
    repo,
    state: "all",
    limit: 100,
    enabled: shouldDiscoverByBranch,
  });

  // When we already have a stored link, still observe the Header branch list
  // (cache-only) so open/merge state can refresh without an extra WS call.
  const branchPrCacheQuery = useBranchPrListQuery({
    owner: stored ? owner : "",
    repo: stored ? repo : "",
    branch: stored ? queryBranch : "",
    state: "all",
    enabled: false,
  });

  const discoveredPr = useMemo(() => {
    if (stored) return null;
    const list = (repoPrQuery.data ?? []) as HeadBranchPrLike[];
    return pickBranchHeadPr(list, headRef);
  }, [headRef, repoPrQuery.data, stored]);

  const managed: GithubPrPayload | null = useMemo(() => {
    if (stored) return stored;
    if (discoveredPr && owner && repo) {
      return toManagedPayload(owner, repo, discoveredPr);
    }
    return null;
  }, [discoveredPr, owner, repo, stored]);

  const prNumber = managed?.number ?? 0;
  const canQueryDetail = Boolean(managed && owner && repo && prNumber);

  const detailQuery = useQuery({
    ...githubPrDetailQueryOptions(
      scope,
      connectionState,
      { owner, repo, prNumber },
      { enabled: canQueryDetail },
    ),
    refetchInterval: (query) => {
      const checks = extractStatusChecks(query.state.data);
      return hasRunningChecks(checks) ? CHECKS_POLL_MS : false;
    },
  });

  const branchPr = useMemo(() => {
    if (!managed) return null;
    // Prefer header branch-list cache when present.
    const fromHeader = Array.isArray(branchPrCacheQuery.data)
      ? (branchPrCacheQuery.data as BranchPr[]).find(
          (pr) => Number(pr.number) === managed.number,
        )
      : null;
    if (fromHeader) return fromHeader;
    // Fall back to repo list row.
    if (discoveredPr && Number(discoveredPr.number) === managed.number) {
      return {
        number: discoveredPr.number,
        title: discoveredPr.title ?? undefined,
        state: discoveredPr.state ?? undefined,
        url: discoveredPr.url ?? undefined,
        headRefName: discoveredPr.headRefName ?? discoveredPr.head_ref ?? undefined,
        baseRefName: discoveredPr.baseRefName ?? discoveredPr.base_ref ?? undefined,
        isDraft: discoveredPr.isDraft ?? discoveredPr.is_draft ?? undefined,
      } satisfies BranchPr;
    }
    return null;
  }, [branchPrCacheQuery.data, discoveredPr, managed]);

  const presentation = useMemo(() => {
    if (!managed) return null;
    return resolveWorkspacePrPresentation({
      managed,
      branchPr,
      detail: detailQuery.data ?? null,
    });
  }, [branchPr, detailQuery.data, managed]);

  const discovering =
    shouldDiscoverByBranch &&
    repoPrQuery.isLoading &&
    !discoveredPr;

  return {
    presentation,
    isLoadingChecks:
      discovering ||
      (canQueryDetail && detailQuery.isFetching && detailQuery.data == null),
  };
}
