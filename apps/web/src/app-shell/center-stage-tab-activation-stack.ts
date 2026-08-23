/**
 * Per-context MRU activation stack for center-stage tabs.
 *
 * When the active tab is closed, the next surface should be the most recently
 * activated still-open tab (VS Code / browser style) — not a visual neighbor
 * or the first item in the strip.
 *
 * Session-scoped only (in-memory). Context switch restore still uses
 * `lastTabByContext` prefs; this stack is for close-time navigation.
 */

const MAX_STACK_SIZE = 64;

/** contextId → MRU order (index 0 = most recently activated). */
const stacksByContext = new Map<string, string[]>();

/** Record that `tabValue` became active in `contextId`. Moves it to the front. */
export function recordCenterTabActivation(
  contextId: string,
  tabValue: string,
): void {
  if (!contextId || !tabValue) return;
  const prev = stacksByContext.get(contextId) ?? [];
  const next = [tabValue, ...prev.filter((value) => value !== tabValue)].slice(
    0,
    MAX_STACK_SIZE,
  );
  stacksByContext.set(contextId, next);
}

/** Drop every close-navigation entry for a paint context (space delete). */
export function clearCenterTabActivationStack(contextId: string): void {
  if (!contextId) return;
  stacksByContext.delete(contextId);
}

/** Drop a closed (or otherwise gone) tab from the stack. */
export function removeCenterTabFromActivationStack(
  contextId: string,
  tabValue: string,
): void {
  if (!contextId || !tabValue) return;
  const prev = stacksByContext.get(contextId);
  if (!prev?.length) return;
  const next = prev.filter((value) => value !== tabValue);
  if (next.length === 0) {
    stacksByContext.delete(contextId);
    return;
  }
  stacksByContext.set(contextId, next);
}

/**
 * Most recently activated tab that is still in `openTabValues`.
 * Skips entries that are gone (closed / hidden) and prunes them from the stack.
 */
export function pickNextCenterTabFromActivationStack(
  contextId: string,
  openTabValues: ReadonlySet<string>,
): string | null {
  if (!contextId) return null;
  const prev = stacksByContext.get(contextId) ?? [];
  if (prev.length === 0) return null;

  const kept: string[] = [];
  let picked: string | null = null;
  for (const value of prev) {
    if (!openTabValues.has(value)) continue;
    kept.push(value);
    if (picked === null) picked = value;
  }

  if (kept.length === 0) {
    stacksByContext.delete(contextId);
  } else {
    stacksByContext.set(contextId, kept);
  }
  return picked;
}

/** Snapshot for tests / debugging. */
export function getCenterTabActivationStack(
  contextId: string,
): readonly string[] {
  return stacksByContext.get(contextId) ?? [];
}

/** Test helper — clear all stacks. */
export function resetCenterTabActivationStacksForTests(): void {
  stacksByContext.clear();
}

/**
 * Build the set of currently open/activatable center tab values for a context,
 * then remove any just-closed values (hook state may still be stale).
 */
export function buildOpenCenterTabValues(input: {
  openFilePaths: readonly string[];
  terminalTabIds: readonly string[];
  githubTabValues: readonly string[];
  browserTabValues: readonly string[];
  projectWikiVisible: boolean;
  codeReviewVisible: boolean;
  simulatorVisible?: boolean;
  gitHistoryVisible?: boolean;
  changesVisible?: boolean;
  reviewVisible?: boolean;
  runVisible?: boolean;
  githubHubVisible?: boolean;
  filesVisible?: boolean;
  ptDesignVisible?: boolean;
  wikiEnabled: boolean;
  /** Always-available fixed surfaces (defaults to overview). */
  fixedAlwaysOpen?: readonly string[];
  exclude?: Iterable<string>;
}): Set<string> {
  const open = new Set<string>(input.fixedAlwaysOpen ?? ["overview"]);
  if (input.wikiEnabled) open.add("wiki");
  if (input.projectWikiVisible) open.add("project-wiki");
  if (input.codeReviewVisible) open.add("code-review");
  if (input.simulatorVisible) open.add("simulator");
  if (input.gitHistoryVisible) open.add("git-history");
  if (input.changesVisible) open.add("changes");
  if (input.reviewVisible) open.add("review");
  if (input.runVisible) open.add("run");
  if (input.githubHubVisible) open.add("github");
  if (input.filesVisible) open.add("files");
  if (input.ptDesignVisible) open.add("pt-design");
  for (const id of input.terminalTabIds) open.add(id);
  for (const value of input.githubTabValues) open.add(value);
  for (const value of input.browserTabValues) open.add(value);
  for (const path of input.openFilePaths) open.add(path);
  if (input.exclude) {
    for (const value of input.exclude) open.delete(value);
  }
  return open;
}
