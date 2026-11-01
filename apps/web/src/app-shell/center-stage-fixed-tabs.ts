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
export function shouldSkipLastTabRestoreForUrlTab(tabFromUrl: string | null | undefined): boolean {
  if (!tabFromUrl) return false;
  if (FIXED_TABS.has(tabFromUrl)) return true;
  return tabFromUrl.startsWith("agent-chat:");
}

/**
 * Last-tab ids that are editor documents (pinned or italic preview).
 * Prefix checks stay local so restore policy does not import the tab-bar graph.
 */
export function isEditorDocumentLastTab(tab: string | null | undefined): boolean {
  if (!tab) return false;
  if (FIXED_TABS.has(tab)) return false;
  if (tab === "terminal" || tab.startsWith("terminal-tab:")) return false;
  if (
    tab.startsWith("github-") ||
    tab.startsWith("git-commit:") ||
    tab.startsWith("browser:") ||
    tab.startsWith("agent-chat:")
  ) {
    return false;
  }
  return true;
}

export type CenterLastTabRestoreAction = "activate" | "wait" | "fallback";

/**
 * Unpinned preview tabs live in the editor store. Restoring last-tab before
 * that store hydrates — or before connection bootstrap picks the instance —
 * treats the path as missing and writes Chat over it.
 */
export function resolveCenterLastTabRestore(input: {
  last: string;
  editorHydrated: boolean;
  openFilePaths: readonly string[];
  connectionReady?: boolean;
}): CenterLastTabRestoreAction {
  if (!isEditorDocumentLastTab(input.last)) return "activate";
  if (input.connectionReady === false) return "wait";
  if (!input.editorHydrated) return "wait";
  if (!input.openFilePaths.includes(input.last)) return "fallback";
  return "activate";
}
