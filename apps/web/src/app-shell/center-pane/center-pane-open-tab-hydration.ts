/**
 * Persisted center layouts must not reconcile against an incomplete open-tab
 * list. Editor (and persist-backed github/browser tabs) hydrate after first
 * paint; reconciling too early prunes file tabs and file-only secondary panes.
 */

export function areOpenTabIdListSourcesHydrated(input: {
  editorHydrated: boolean;
  githubHydrated: boolean;
  browserHydrated: boolean;
  gitCommitHydrated?: boolean;
  agentChatHydrated?: boolean;
  /** Persisted pane layout must load before reconcile, or default layout overwrites splits. */
  layoutHydrated?: boolean;
}): boolean {
  if (input.layoutHydrated === false) return false;
  if (input.gitCommitHydrated === false) return false;
  if (input.agentChatHydrated === false) return false;
  return input.editorHydrated && input.githubHydrated && input.browserHydrated;
}
