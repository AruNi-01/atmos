/**
 * Per-context MRU activation stack for every center-stage tab value.
 *
 * Tab ids are opaque strings (Files, Changes, terminals, editor paths, …).
 * Close navigates to the most recently activated still-open tab — not a visual
 * neighbor, the first strip item, or a Files-specific path.
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
 *
 * Extra surfaces (tool tabs, simulator, …) are passed as ids — do not add
 * per-tab booleans here or new tabs will be invisible to close-time MRU.
 */
export function buildOpenCenterTabValues(input: {
  openFilePaths: readonly string[];
  terminalTabIds: readonly string[];
  githubTabValues: readonly string[];
  browserTabValues: readonly string[];
  extraOpenTabValues?: readonly string[];
  wikiEnabled: boolean;
  /** Opt-in fixed surfaces such as Overview. Empty by default. */
  fixedAlwaysOpen?: readonly string[];
  exclude?: Iterable<string>;
}): Set<string> {
  const open = new Set<string>(input.fixedAlwaysOpen ?? []);
  if (input.wikiEnabled) open.add("wiki");
  if (input.extraOpenTabValues) {
    for (const value of input.extraOpenTabValues) {
      if (value) open.add(value);
    }
  }
  for (const id of input.terminalTabIds) open.add(id);
  for (const value of input.githubTabValues) open.add(value);
  for (const value of input.browserTabValues) open.add(value);
  for (const path of input.openFilePaths) open.add(path);
  if (input.exclude) {
    for (const value of input.exclude) open.delete(value);
  }
  return open;
}
