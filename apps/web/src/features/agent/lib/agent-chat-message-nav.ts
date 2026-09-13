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

/** Negative `top` so the next user prompt can push the sticky prompt out. */
export function stickyUserMessagePushPx(
  nextUserViewportTop: number,
  stickyHeight: number,
): number {
  if (!Number.isFinite(nextUserViewportTop) || !Number.isFinite(stickyHeight)) return 0;
  if (stickyHeight <= 0) return 0;
  return Math.min(0, nextUserViewportTop - stickyHeight);
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
