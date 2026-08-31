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
