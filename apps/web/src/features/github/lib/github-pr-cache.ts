"use client";

/**
 * BranchPr is the shape returned by the github_pr_list WS action for a specific
 * branch. Kept here so github-query-options.ts can reference it without creating
 * a circular dependency.
 *
 * The module-level Map caches (repoPrCache, branchPrCache) that previously lived
 * here have been removed as part of APP-035 — all PR data is now owned by
 * TanStack Query under the computer.githubRepoPrList / githubBranchPrList keys.
 */
export type BranchPr = Record<string, unknown> & {
  number: number;
  title?: string;
  state?: string;
  url?: string;
  headRefName?: string;
  baseRefName?: string;
  isDraft?: boolean;
};
