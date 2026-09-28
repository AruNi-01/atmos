/** Interval last known to be stored on the Computer, not an optimistic picker value. */
export type SavedAutoRefresh = {
  minutes: number | null;
  /** Highest set-auto-refresh generation whose success was applied. */
  appliedGeneration: number;
};

/** Keep the first saved interval. A later optimistic selection must not replace it. */
export function seedSavedAutoRefresh(current: SavedAutoRefresh | null, minutes: number | null): SavedAutoRefresh {
  if (current) return current;
  return { minutes, appliedGeneration: 0 };
}

/** Record a server apply. An older response must not replace a newer one. */
export function noteSavedAutoRefresh(
  current: SavedAutoRefresh,
  generation: number,
  minutes: number | null,
): SavedAutoRefresh {
  if (generation < current.appliedGeneration) return current;
  return { minutes, appliedGeneration: generation };
}
