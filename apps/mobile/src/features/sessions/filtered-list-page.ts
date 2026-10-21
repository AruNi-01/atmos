export const FILTERED_LIST_PAGE_SIZE = 20;

export type FilteredListStatus = "loading" | "ready" | "loading-more" | "error" | "end";

export type FilteredListWindowState = {
  filterKey: string;
  visibleCount: number;
  previousLoadedCount: number;
};

export function syncFilteredListFilter(
  current: { key: string; visibleCount: number },
  filterKey: string,
): { key: string; visibleCount: number } {
  if (current.key === filterKey) return current;
  return { key: filterKey, visibleCount: FILTERED_LIST_PAGE_SIZE };
}

/**
 * Render-time window update. Returns `state` when nothing changed so the hook
 * can skip a setState. A new filter restores the first page and records the
 * loaded count already on screen, so an auto-fill does not look like a page
 * the user consumed.
 */
export function reduceFilteredListWindow(
  state: FilteredListWindowState,
  input: { filterKey: string; loadedCount: number },
): FilteredListWindowState {
  if (state.filterKey !== input.filterKey) {
    return {
      filterKey: input.filterKey,
      visibleCount: FILTERED_LIST_PAGE_SIZE,
      previousLoadedCount: input.loadedCount,
    };
  }
  const visibleCount = visibleCountAfterServerPage({
    visibleCount: state.visibleCount,
    previousLoadedCount: state.previousLoadedCount,
    loadedCount: input.loadedCount,
  });
  if (visibleCount === state.visibleCount && state.previousLoadedCount === input.loadedCount) {
    return state;
  }
  return {
    filterKey: state.filterKey,
    visibleCount,
    previousLoadedCount: input.loadedCount,
  };
}

export function filteredListFirstFrame<T>(input: {
  pending: boolean;
  rows: readonly T[];
  visibleCount: number;
  hasNextServerPage: boolean;
  fetchFailed: boolean;
}): { mode: "skeleton" | "empty" | "rows"; rows: T[] } {
  if (input.rows.length === 0 && !input.fetchFailed && (input.pending || input.hasNextServerPage)) {
    return { mode: "skeleton", rows: [] };
  }
  if (input.rows.length === 0) return { mode: "empty", rows: [] };
  return { mode: "rows", rows: input.rows.slice(0, Math.max(0, input.visibleCount)) };
}

export function filteredListStatus(input: {
  pending: boolean;
  loadedCount: number;
  visibleCount: number;
  hasNextServerPage: boolean;
  fetching: boolean;
  fetchFailed: boolean;
}): FilteredListStatus {
  if (input.fetchFailed) return "error";
  if (
    (input.pending && input.loadedCount === 0) ||
    (input.loadedCount === 0 && input.hasNextServerPage)
  ) {
    return "loading";
  }
  if (input.fetching && input.visibleCount >= input.loadedCount && input.hasNextServerPage) {
    return "loading-more";
  }
  if (input.loadedCount <= input.visibleCount && !input.hasNextServerPage) return "end";
  return "ready";
}

/** Post-paint fill for the first UI page only. Later pages wait for a scroll. */
export function filteredListShouldFetch(input: {
  loadedCount: number;
  visibleCount: number;
  hasNextServerPage: boolean;
  fetching: boolean;
  fetchFailed: boolean;
}): boolean {
  if (input.fetching || input.fetchFailed || !input.hasNextServerPage) return false;
  return input.loadedCount < Math.min(input.visibleCount, FILTERED_LIST_PAGE_SIZE);
}

export function advanceFilteredList(input: {
  visibleCount: number;
  loadedCount: number;
  hasNextServerPage: boolean;
  fetching: boolean;
  fetchFailed: boolean;
}): { visibleCount: number; fetch: boolean } {
  if (input.fetching || input.fetchFailed) {
    return { visibleCount: input.visibleCount, fetch: false };
  }
  if (input.visibleCount < input.loadedCount) {
    return {
      visibleCount: Math.min(input.visibleCount + FILTERED_LIST_PAGE_SIZE, input.loadedCount),
      fetch: false,
    };
  }
  if (input.hasNextServerPage) {
    return { visibleCount: input.visibleCount, fetch: true };
  }
  return { visibleCount: input.visibleCount, fetch: false };
}

export function visibleCountAfterServerPage(input: {
  visibleCount: number;
  previousLoadedCount: number;
  loadedCount: number;
}): number {
  if (input.loadedCount <= input.previousLoadedCount) return input.visibleCount;
  const caughtUp =
    input.previousLoadedCount >= FILTERED_LIST_PAGE_SIZE &&
    input.visibleCount >= input.previousLoadedCount;
  if (!caughtUp) return input.visibleCount;
  return Math.min(input.visibleCount + FILTERED_LIST_PAGE_SIZE, input.loadedCount);
}

export function beginFilteredListFetch(
  state: { requesting: boolean },
  input: { fetching: boolean; fetchFailed: boolean; hasNextServerPage: boolean },
): { requesting: boolean; fetch: boolean } {
  if (state.requesting || input.fetching || input.fetchFailed || !input.hasNextServerPage) {
    return { requesting: state.requesting, fetch: false };
  }
  return { requesting: true, fetch: true };
}

export function settleFilteredListFetch(
  state: { requesting: boolean; sawFetching: boolean },
  fetching: boolean,
): { requesting: boolean; sawFetching: boolean } {
  if (fetching) return { requesting: state.requesting, sawFetching: true };
  if (!state.requesting && !state.sawFetching) return state;
  return { requesting: false, sawFetching: false };
}

export function retryFilteredListFetch(): {
  requesting: true;
  sawFetching: false;
  fetch: true;
} {
  return { requesting: true, sawFetching: false, fetch: true };
}
