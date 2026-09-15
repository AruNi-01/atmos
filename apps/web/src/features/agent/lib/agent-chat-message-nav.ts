export type UserMessageNavRect = {
  messageIndex: number;
  top: number;
  bottom: number;
};

export type TranscriptMeasurement = {
  start: number;
  size: number;
};

/** Viewport-relative user-message rects from the virtualizer cache (off-screen rows included). */
export function userMessageRectsFromMeasurements(
  userMessageIndices: readonly number[],
  measurements: ReadonlyArray<TranscriptMeasurement | undefined>,
  scrollTop: number,
): UserMessageNavRect[] {
  const rects: UserMessageNavRect[] = [];
  for (const messageIndex of userMessageIndices) {
    const measurement = measurements[messageIndex];
    if (!measurement) continue;
    rects.push({
      messageIndex,
      top: measurement.start - scrollTop,
      bottom: measurement.start + measurement.size - scrollTop,
    });
  }
  return rects;
}

/**
 * Last user prompt whose natural top has reached or passed the scrollport top.
 * Independent of the virtualizer's visible range so pin/unpin is not one frame late.
 */
export function resolveStickyUserMessageIndex(
  userMessageIndices: readonly number[],
  measurements: ReadonlyArray<TranscriptMeasurement | undefined>,
  scrollTop: number,
): number | null {
  let sticky: number | null = null;
  for (const index of userMessageIndices) {
    const measurement = measurements[index];
    if (!measurement) continue;
    if (measurement.start > scrollTop + 0.5) break;
    sticky = index;
  }
  return sticky;
}

/**
 * Clone the user prompt only after its original row has left the top.
 * While the next prompt occupies the top, keep using that original row so
 * the previous overlay can scroll away instead of swapping in a flash.
 */
export function shouldPinStickyUserMessage(start: number, scrollTop: number): boolean {
  return start < scrollTop - 1;
}

export function nextUserMessageIndex(
  userMessageIndices: readonly number[],
  current: number,
): number | null {
  const at = userMessageIndices.indexOf(current);
  if (at < 0) return null;
  return userMessageIndices[at + 1] ?? null;
}

export function previousUserMessageIndex(
  userMessageIndices: readonly number[],
  current: number,
): number | null {
  const at = userMessageIndices.indexOf(current);
  if (at <= 0) return null;
  return userMessageIndices[at - 1] ?? null;
}

/**
 * Previous/next user prompt from the active one.
 * An unknown current (not yet synced) is treated as the last prompt, matching
 * the transcript's default scroll-to-end.
 */
export function stepUserMessageIndex(
  userMessageIndices: readonly number[],
  current: number,
  direction: "previous" | "next",
): number | null {
  const at = userMessageIndices.indexOf(current);
  const resolvedAt = at >= 0 ? at : userMessageIndices.length - 1;
  if (resolvedAt < 0) return null;
  const nextAt = direction === "next" ? resolvedAt + 1 : resolvedAt - 1;
  return userMessageIndices[nextAt] ?? null;
}

export const TIMELINE_RAIL_ITEM_SIZE_MAX = 14;
export const TIMELINE_RAIL_ITEM_SIZE_MIN = 0.5;
export const TIMELINE_RAIL_COMPRESS_RATIO = 0.5;
export const TIMELINE_RAIL_MAX_RATIO = 0.9;

/**
 * Tick stride for the message directory.
 * Default spacing until the rail would pass 50% of the column. After that the
 * stride eases from 14px toward 0.5px as count grows, while the rail itself
 * may grow up to 90%. It does not jump to the 0.5px floor.
 */
export function timelineRailItemSize(
  count: number,
  containerHeight: number,
  reservedPx = 0,
): number {
  const maxSize = TIMELINE_RAIL_ITEM_SIZE_MAX;
  const minSize = TIMELINE_RAIL_ITEM_SIZE_MIN;
  if (count <= 0) return maxSize;
  if (!(containerHeight > 0)) return maxSize;

  const maxHeight = Math.max(
    minSize,
    Math.min(
      containerHeight * TIMELINE_RAIL_MAX_RATIO,
      containerHeight - Math.max(0, reservedPx),
    ),
  );
  const compressStart = Math.min(containerHeight * TIMELINE_RAIL_COMPRESS_RATIO, maxHeight);
  if (count * maxSize <= compressStart) return maxSize;

  const countStart = compressStart / maxSize;
  const countEnd = maxHeight / minSize;
  if (!(countEnd > countStart)) return Math.max(0, maxHeight / count);

  const t = Math.min(1, (count - countStart) / (countEnd - countStart));
  const interpolated = maxSize + t * (minSize - maxSize);
  return Math.min(maxSize, Math.max(0, Math.min(interpolated, maxHeight / count)));
}

/**
 * Overlay clone only for a prompt whose original row has left the top.
 * The prompt currently sitting at the top stays in its original row.
 */
export function resolveStickyOverlayIndex(
  userMessageIndices: readonly number[],
  measurements: ReadonlyArray<TranscriptMeasurement | undefined>,
  scrollTop: number,
): number | null {
  const candidate = resolveStickyUserMessageIndex(
    userMessageIndices,
    measurements,
    scrollTop,
  );
  if (candidate == null) return null;
  const measurement = measurements[candidate];
  if (!measurement) return null;
  return shouldPinStickyUserMessage(measurement.start, scrollTop) ? candidate : null;
}

/** Hide the agent-token fade once the next user prompt would enter it. */
export function shouldHideStickyUserFade(
  incomingTop: number,
  stickyHeight: number,
  fadePx: number,
): boolean {
  if (!Number.isFinite(incomingTop) || !Number.isFinite(stickyHeight) || stickyHeight <= 0) {
    return false;
  }
  return incomingTop < stickyHeight + fadePx;
}

/**
 * How far to shift a pinned user prompt so the next user prompt can push it out.
 * Negative means up. `gap` matches the virtualizer row gap so the two bubbles
 * do not kiss at the handover.
 */
export function stickyUserMessagePushPx(
  nextUserViewportTop: number,
  stickyHeight: number,
  gap = 0,
): number {
  if (!Number.isFinite(nextUserViewportTop) || !Number.isFinite(stickyHeight)) return 0;
  if (stickyHeight <= 0) return 0;
  const spacing = Number.isFinite(gap) ? Math.max(0, gap) : 0;
  return Math.min(0, nextUserViewportTop - stickyHeight - spacing);
}

/**
 * `translateY` for a pinned user row that stays in the virtualizer absolute layer.
 * Pin sits at the scrollport (`scrollTop - scrollMargin + pinTop`); the next
 * user prompt then adds {@link stickyUserMessagePushPx} so adjacent prompts
 * fall back to their natural `start - scrollMargin` instead of fighting CSS sticky.
 */
export function stickyUserTranslateY(
  scrollTop: number,
  scrollMargin: number,
  stickySize: number,
  nextUserStart: number | null | undefined,
  gap = 0,
  pinTop = 0,
): number {
  if (!Number.isFinite(scrollTop) || !Number.isFinite(scrollMargin)) return 0;
  const pin = scrollTop - scrollMargin + pinTop;
  if (!Number.isFinite(stickySize) || stickySize <= 0) return pin;
  if (nextUserStart == null || !Number.isFinite(nextUserStart)) return pin;
  const nextViewportTop = nextUserStart - scrollTop - pinTop;
  return pin + stickyUserMessagePushPx(nextViewportTop, stickySize, gap);
}

export function stickyUserPinLayout(
  scrollTop: number,
  scrollMargin: number,
  stickySize: number,
  nextUserStart: number | null | undefined,
  gap = 0,
  pinTop = 0,
  fadePx = 0,
): { translateY: number; hideFade: boolean } {
  const nextViewportTop =
    nextUserStart == null || !Number.isFinite(nextUserStart)
      ? Number.POSITIVE_INFINITY
      : nextUserStart - scrollTop - pinTop;
  return {
    translateY: stickyUserTranslateY(
      scrollTop,
      scrollMargin,
      stickySize,
      nextUserStart,
      gap,
      pinTop,
    ),
    hideFade: shouldHideStickyUserFade(nextViewportTop, stickySize, fadePx),
  };
}

/**
 * CSS-sticky overlay only needs the push offset (`top`) and fade.
 * Pinning itself is compositor sticky; do not fake it with translateY(scrollTop).
 */
export function stickyUserPushLayout(
  scrollTop: number,
  stickySize: number,
  nextUserStart: number | null | undefined,
  gap = 0,
  pinTop = 0,
  fadePx = 0,
): { pushPx: number; hideFade: boolean } {
  const nextViewportTop =
    nextUserStart == null || !Number.isFinite(nextUserStart)
      ? Number.POSITIVE_INFINITY
      : nextUserStart - scrollTop - pinTop;
  return {
    pushPx: stickyUserMessagePushPx(nextViewportTop, stickySize, gap),
    hideFade: shouldHideStickyUserFade(nextViewportTop, stickySize, fadePx),
  };
}

/** Last user prompt in view, or the last one already scrolled past if none remain in view. */
export function resolveActiveUserMessageIndex(
  items: readonly UserMessageNavRect[],
  view: { height: number; scrollTop: number; scrollHeight: number },
): number | null {
  if (items.length === 0) return null;
  const last = items[items.length - 1]!.messageIndex;
  if (view.scrollTop + view.height >= view.scrollHeight - 16) return last;

  const viewBottom = view.height - 24;
  let lastIntersecting: number | null = null;
  let lastAbove: number | null = null;
  for (const item of items) {
    if (item.top < viewBottom && item.bottom > 0) {
      lastIntersecting = item.messageIndex;
      continue;
    }
    if (item.bottom <= 0) lastAbove = item.messageIndex;
  }
  return lastIntersecting ?? lastAbove ?? items[0]!.messageIndex;
}
