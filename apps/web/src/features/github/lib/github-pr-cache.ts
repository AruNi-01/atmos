"use client";

import type { GithubPrPayload } from "@/api/ws/github-api";

export const GITHUB_PR_CACHE_TTL_MS = 5 * 60 * 1000;

export type BranchPr = Record<string, unknown> & {
  number: number;
  title?: string;
  state?: string;
  url?: string;
  headRefName?: string;
  baseRefName?: string;
  isDraft?: boolean;
};

type RepoPrCacheEntry = {
  expiresAt: number;
  prs: GithubPrPayload[];
};

type BranchPrCacheEntry = {
  expiresAt: number;
  prs: BranchPr[];
};

const repoPrCache = new Map<string, RepoPrCacheEntry>();
const branchPrCache = new Map<string, BranchPrCacheEntry>();

function normalizeState(state?: string) {
  return (state ?? "open").toLowerCase();
}

function repoPrCacheKey(owner: string, repo: string, state?: string, limit?: number) {
  return `${owner}/${repo}:${normalizeState(state)}:${limit ?? 50}`;
}

function branchPrCacheKey(owner: string, repo: string, branch: string, state?: string) {
  return `${owner}/${repo}:${branch}:${normalizeState(state)}`;
}

function clearCachedBranchPrsForRepo(owner: string, repo: string) {
  const prefix = `${owner}/${repo}:`;
  for (const key of branchPrCache.keys()) {
    if (key.startsWith(prefix)) {
      branchPrCache.delete(key);
    }
  }
}

function isFresh<T extends { expiresAt: number }>(entry: T | undefined): entry is T {
  return !!entry && entry.expiresAt > Date.now();
}

export function getCachedRepoPrs(params: {
  owner: string;
  repo: string;
  state?: string;
  limit?: number;
}): GithubPrPayload[] | null {
  const entry = repoPrCache.get(repoPrCacheKey(params.owner, params.repo, params.state, params.limit));
  if (!isFresh(entry)) return null;
  return entry.prs;
}

export function setCachedRepoPrs(
  params: { owner: string; repo: string; state?: string; limit?: number },
  prs: GithubPrPayload[],
) {
  clearCachedBranchPrsForRepo(params.owner, params.repo);
  repoPrCache.set(repoPrCacheKey(params.owner, params.repo, params.state, params.limit), {
    expiresAt: Date.now() + GITHUB_PR_CACHE_TTL_MS,
    prs,
  });
}

export function clearCachedRepoPrs(params: {
  owner: string;
  repo: string;
  state?: string;
  limit?: number;
}) {
  clearCachedBranchPrsForRepo(params.owner, params.repo);
  repoPrCache.delete(repoPrCacheKey(params.owner, params.repo, params.state, params.limit));
}

export async function fetchRepoPrsWithCache(
  params: { owner: string; repo: string; state?: string; limit?: number; force?: boolean },
  fetcher: () => Promise<GithubPrPayload[]>,
): Promise<GithubPrPayload[]> {
  if (!params.force) {
    const cached = getCachedRepoPrs(params);
    if (cached) return cached;
  }

  const prs = await fetcher();
  setCachedRepoPrs(params, prs);
  return prs;
}

export function getCachedBranchPrs(params: {
  owner: string;
  repo: string;
  branch: string;
  state?: string;
}): BranchPr[] | null {
  const entry = branchPrCache.get(
    branchPrCacheKey(params.owner, params.repo, params.branch, params.state),
  );
  if (!isFresh(entry)) return null;
  return entry.prs;
}

export function setCachedBranchPrs(
  params: { owner: string; repo: string; branch: string; state?: string },
  prs: BranchPr[],
) {
  branchPrCache.set(branchPrCacheKey(params.owner, params.repo, params.branch, params.state), {
    expiresAt: Date.now() + GITHUB_PR_CACHE_TTL_MS,
    prs,
  });
}

export function clearCachedBranchPrs(params: {
  owner: string;
  repo: string;
  branch: string;
  state?: string;
}) {
  branchPrCache.delete(branchPrCacheKey(params.owner, params.repo, params.branch, params.state));
}

/** Clear all module-level PR caches on Computer target switch (APP-035). */
export function clearAllCachedPrs(): void {
  repoPrCache.clear();
  branchPrCache.clear();
}

export function getRepoPrSeedForBranch(params: {
  owner: string;
  repo: string;
  branch: string;
  state?: string;
  limit?: number;
}): BranchPr[] | null {
  const state = normalizeState(params.state);
  if (state === "all") return null;

  const cached = getCachedRepoPrs(params);
  if (!cached) return null;

  const branchPrs = cached
    .filter((pr) => pr.head_ref === params.branch || pr.base_ref === params.branch)
    .map((pr) => ({
      number: pr.number,
      title: pr.title,
      state: pr.state.toUpperCase(),
      url: pr.url,
      headRefName: pr.head_ref,
      baseRefName: pr.base_ref,
      isDraft: pr.is_draft,
    }));

  return branchPrs;
}
