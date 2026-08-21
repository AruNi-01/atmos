/**
 * Collapse N→1 strip persistence is context-keyed. An unkeyed pane-count
 * drop (split workspace X → single-pane workspace Y) must never write Y's
 * order prefs.
 */

export type CenterPaneCountTransition = {
  prevContextId: string | null | undefined;
  nextContextId: string | null | undefined;
  prevPaneCount: number;
  nextPaneCount: number;
};

export function isSameCenterPaneContext(
  prevContextId: string | null | undefined,
  nextContextId: string | null | undefined,
): boolean {
  return Boolean(prevContextId && nextContextId && prevContextId === nextContextId);
}

export function shouldPersistCollapsedStripOrder(
  input: CenterPaneCountTransition,
): boolean {
  return (
    isSameCenterPaneContext(input.prevContextId, input.nextContextId) &&
    input.prevPaneCount > 1 &&
    input.nextPaneCount <= 1
  );
}

export function shouldSeedMosaicFromFullPane(
  input: CenterPaneCountTransition,
): boolean {
  return (
    isSameCenterPaneContext(input.prevContextId, input.nextContextId) &&
    input.prevPaneCount <= 1 &&
    input.nextPaneCount > 1
  );
}

/**
 * Workspace hops must snap the shared mosaic to the destination geometry.
 * Animating from the previous workspace's tiles reads as a split opening
 * (grow-from-small) and refits warm terminals at the wrong size.
 */
export function shouldSnapPaneTilesOnContextChange(
  prevContextId: string | null | undefined,
  nextContextId: string | null | undefined,
): boolean {
  return Boolean(
    prevContextId &&
      nextContextId &&
      prevContextId !== nextContextId,
  );
}

export function shouldHoldMosaicAfterCollapse(
  input: CenterPaneCountTransition,
): boolean {
  return shouldPersistCollapsedStripOrder(input);
}

/** Remaining pane order to persist for a same-context collapse, or null. */
export function collapsedStripOrderForContext(input: {
  collapsingContextId: string | null | undefined;
  destinationContextId: string | null | undefined;
  prevPaneCount: number;
  nextPaneCount: number;
  remainingTabIds: readonly string[] | undefined;
}): { contextId: string; order: string[] } | null {
  if (
    !shouldPersistCollapsedStripOrder({
      prevContextId: input.collapsingContextId,
      nextContextId: input.destinationContextId,
      prevPaneCount: input.prevPaneCount,
      nextPaneCount: input.nextPaneCount,
    })
  ) {
    return null;
  }
  if (!input.collapsingContextId || !input.remainingTabIds?.length) return null;
  return {
    contextId: input.collapsingContextId,
    order: [...input.remainingTabIds],
  };
}
