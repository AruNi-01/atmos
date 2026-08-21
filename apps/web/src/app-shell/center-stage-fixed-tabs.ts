/**
 * Center tabs that live in `?tab=` (not file paths). Pure so restore policy
 * can be unit-tested without pulling the tab-bar UI graph.
 */
export const FIXED_TABS = new Set<string>([
  "overview",
  "wiki",
  "project-wiki",
  "code-review",
  "simulator",
  "git-history",
  "changes",
  "review",
  "run",
  "github",
  "files",
  "pt-design",
]);

/** Explicit `?tab=` for a fixed/tool surface must not lose to last-tab restore. */
export function shouldSkipLastTabRestoreForUrlTab(
  tabFromUrl: string | null | undefined,
): boolean {
  return Boolean(tabFromUrl && FIXED_TABS.has(tabFromUrl));
}
