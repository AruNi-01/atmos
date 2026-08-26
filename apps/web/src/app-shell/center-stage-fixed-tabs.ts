import { CENTER_TOOL_TAB_VALUES } from "@/app-shell/center-tool-tabs";

/**
 * Center tabs that live in `?tab=` (not file paths). Pure so restore policy
 * can be unit-tested without pulling the tab-bar UI graph.
 *
 * Tool tabs come from {@link CENTER_TOOL_TAB_VALUES} so a new plus-menu surface
 * is not treated as an editor path.
 */
export const FIXED_TABS = new Set<string>([
  "overview",
  "wiki",
  "project-wiki",
  "code-review",
  "simulator",
  "git-history",
  ...CENTER_TOOL_TAB_VALUES,
]);

/** Explicit `?tab=` for a fixed/tool surface must not lose to last-tab restore. */
export function shouldSkipLastTabRestoreForUrlTab(
  tabFromUrl: string | null | undefined,
): boolean {
  return Boolean(tabFromUrl && FIXED_TABS.has(tabFromUrl));
}
