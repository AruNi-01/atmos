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
