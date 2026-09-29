/** Interval last known to be stored on one Computer, not an optimistic picker value. */
export type SavedAutoRefresh = {
  /** Computer this interval belongs to. */
  computerKey: string | null;
  minutes: number | null;
  /** Highest set-auto-refresh generation whose success was applied. */
  appliedGeneration: number;
};

/**
 * Keep this Computer's saved interval across later optimistic selections.
 * Another Computer does not inherit it. A missing overview is not Off.
 */
export function seedSavedAutoRefresh(
  current: SavedAutoRefresh | null,
  computerKey: string | null,
  cached: { minutes: number | null } | null,
): SavedAutoRefresh | null {
  if (current?.computerKey === computerKey) return current;
  if (!cached) return null;
  return { computerKey, minutes: cached.minutes, appliedGeneration: 0 };
}

/** Record a server apply. An older response must not replace a newer one. */
export function noteSavedAutoRefresh(
  current: SavedAutoRefresh,
  generation: number,
  minutes: number | null,
): SavedAutoRefresh {
  if (generation < current.appliedGeneration) return current;
  return { ...current, minutes, appliedGeneration: generation };
}

/**
 * Overview data is the Computer's stored interval while idle.
 * While a change is in flight, keep a baseline already recorded for this Computer
 * so the optimistic picker value does not become the rollback target.
 */
export function adoptSavedAutoRefresh(
  current: SavedAutoRefresh | null,
  computerKey: string | null,
  overviewLoaded: boolean,
  minutes: number | null,
  requestInFlight: boolean,
): SavedAutoRefresh | null {
  const sameComputer = current?.computerKey === computerKey;
  if (!overviewLoaded) return sameComputer ? current : null;
  if (requestInFlight && sameComputer && current) return current;
  return {
    computerKey,
    minutes,
    appliedGeneration: sameComputer && current ? current.appliedGeneration : 0,
  };
}

/** Minutes to restore for this Computer. Undefined when it has no stored baseline. */
export function savedAutoRefreshMinutes(
  current: SavedAutoRefresh | null,
  computerKey: string | null,
): number | null | undefined {
  if (current?.computerKey !== computerKey) return undefined;
  return current.minutes;
}
