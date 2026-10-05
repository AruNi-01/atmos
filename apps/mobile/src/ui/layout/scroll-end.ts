/** Rounding slack for the scroll view's reported end. */
export const SESSION_LIST_BOTTOM_SLOP = 16;

/**
 * The user has to leave the bottom by this much before another page can load.
 * A short loading spinner must not count as leaving.
 */
export const SESSION_LIST_REARM_DISTANCE = 72;

export type SessionListScrollMetrics = {
  contentHeight: number;
  /** Bottom content inset. The visual end sits this far past the content size. */
  insetBottom?: number;
  offsetY: number;
  viewportHeight: number;
};

/**
 * Points of content still below the viewport. Negative means the viewport
 * extends past the content. Null until both content and viewport are measured.
 */
export function sessionListDistanceFromEnd(metrics: SessionListScrollMetrics): number | null {
  if (metrics.viewportHeight <= 0 || metrics.contentHeight <= 0) return null;
  return metrics.contentHeight - (metrics.insetBottom ?? 0) - metrics.viewportHeight - metrics.offsetY;
}

/**
 * Load the next page once each time the user scrolls a long list to its end.
 * A short list cannot be scrolled, so it loads only while `fillWhenShort` says
 * the visible rows are still behind the known total. Staying at the end after
 * a page arrives does not ask again until the content changes or the user
 * scrolls away.
 */
export function sessionListShouldRequestNextPage(input: {
  contentHeight: number;
  distanceFromEnd: number | null;
  /** True when the user has left the bottom, or a short list grew, since the last request. */
  armed: boolean;
  /** This screen's rows are fewer than its total and the list does not overflow. */
  fillWhenShort?: boolean;
  viewportHeight: number;
}): { armed: boolean; request: boolean } {
  if (input.distanceFromEnd == null || input.viewportHeight <= 0 || input.contentHeight <= 0) {
    return { armed: input.armed, request: false };
  }
  const scrollable = input.contentHeight > input.viewportHeight;
  if (!scrollable) {
    if (!input.fillWhenShort || !input.armed) return { armed: input.armed, request: false };
    return { armed: false, request: true };
  }
  if (input.distanceFromEnd > SESSION_LIST_REARM_DISTANCE) {
    return { armed: true, request: false };
  }
  if (input.distanceFromEnd <= SESSION_LIST_BOTTOM_SLOP && input.armed) {
    return { armed: false, request: true };
  }
  return { armed: input.armed, request: false };
}
