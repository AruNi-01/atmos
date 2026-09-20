import type { TranscriptMeasurement } from "./agent-chat-message-nav";

export type MessagesBelowCountStore = {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => number;
  set: (next: number) => void;
};

export function createMessagesBelowCountStore(
  initial = 0,
): MessagesBelowCountStore {
  let count = Math.max(0, Math.floor(initial));
  const listeners = new Set<() => void>();

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot() {
      return count;
    },
    set(next) {
      const value = Number.isFinite(next) ? Math.max(0, Math.floor(next)) : 0;
      if (value === count) return;
      count = value;
      for (const listener of listeners) listener();
    },
  };
}

/**
 * Count transcript rows whose top edge is at or below the viewport.
 * Trailing rows the virtualizer has not measured yet are treated as below.
 */
export function countMessagesBelowViewport(
  measurements: ReadonlyArray<TranscriptMeasurement | undefined>,
  messageCount: number,
  view: { scrollTop: number; height: number },
): number {
  if (messageCount <= 0 || view.height <= 0) return 0;
  const viewportBottom = view.scrollTop + view.height;
  let below = 0;
  let seenMeasured = false;

  for (let index = messageCount - 1; index >= 0; index -= 1) {
    const measurement = measurements[index];
    if (!measurement) {
      if (!seenMeasured) below += 1;
      continue;
    }
    seenMeasured = true;
    if (measurement.start >= viewportBottom) {
      below += 1;
      continue;
    }
    break;
  }

  return below;
}
