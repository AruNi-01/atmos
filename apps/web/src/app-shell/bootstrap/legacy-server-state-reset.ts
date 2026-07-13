"use client";

/**
 * Compatibility registry: clear Computer-scoped legacy snapshots that Query does not
 * yet own. Entries are removed when their domain cuts over to TanStack Query.
 */
export async function resetLegacyServerStateForConnectionChange(): Promise<void> {
  const [
    { useGitStore },
    { useWikiStore },
    { useReviewSnapshotStore },
    { invalidateLocalComputerStatusCache },
    { clearWelcomeGithubCaches },
  ] = await Promise.all([
    import("@/features/git/store/use-git-store"),
    import("@/features/wiki/store/use-wiki-store"),
    import("@/features/code-review/store/review-snapshot-store"),
    import("@/features/connection/lib/atmos-computer-local"),
    import("@/features/welcome/lib/welcome-page-helpers"),
  ]);

  // Git snapshots (status, changedFiles, fileDiff, branches) are now owned by
  // TanStack Query and cleared via Computer-scope key removal in target-lifecycle.
  // Only the orchestration slice (currentRepoPath, compareMode) needs a manual reset.
  useGitStore.getState().resetForConnectionChange();
  useWikiStore.getState().resetForConnectionChange();
  // Local services scopes are now owned by TanStack Query — cleared via scope key removal.
  useReviewSnapshotStore.getState().clearSnapshot();
  // GitHub PR caches are now owned by TanStack Query — cleared via scope key removal.
  invalidateLocalComputerStatusCache();
  // Issue list cache is still a module-level Map; PR cache is Query-owned.
  clearWelcomeGithubCaches();
}
