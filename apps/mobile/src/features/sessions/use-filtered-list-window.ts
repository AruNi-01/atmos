import { useCallback, useEffect, useRef, useState } from "react";
import {
  advanceFilteredList,
  beginFilteredListFetch,
  FILTERED_LIST_PAGE_SIZE,
  filteredListFirstFrame,
  filteredListShouldFetch,
  filteredListStatus,
  reduceFilteredListWindow,
  retryFilteredListFetch,
  settleFilteredListFetch,
  type FilteredListWindowState,
} from "./filtered-list-page";

type FetchFlags = { requesting: boolean; sawFetching: boolean };

/**
 * UI window of 20 rows. Filter changes and server-page growth update state
 * during render. Fetch bookkeeping stays in a ref that effects and presses
 * touch, so the first paint is not an effect setState.
 */
export function useFilteredListWindow<T>(input: {
  filterKey: string;
  rows: readonly T[];
  pending: boolean;
  hasNextServerPage: boolean;
  fetching: boolean;
  fetchFailed: boolean;
  fetchNext: () => boolean;
  retryNext: () => boolean;
}) {
  const loadedCount = input.rows.length;
  const [windowState, setWindowState] = useState<FilteredListWindowState>(() => ({
    filterKey: input.filterKey,
    visibleCount: FILTERED_LIST_PAGE_SIZE,
    previousLoadedCount: loadedCount,
  }));
  const reduced = reduceFilteredListWindow(windowState, {
    filterKey: input.filterKey,
    loadedCount,
  });
  if (reduced !== windowState) setWindowState(reduced);
  const visibleCount = reduced.visibleCount;

  const fetchStateRef = useRef<FetchFlags>({ requesting: false, sawFetching: false });
  const fetchNextRef = useRef(input.fetchNext);
  const retryNextRef = useRef(input.retryNext);

  useEffect(() => {
    fetchNextRef.current = input.fetchNext;
    retryNextRef.current = input.retryNext;
  }, [input.fetchNext, input.retryNext]);

  const { fetchFailed, fetching, hasNextServerPage } = input;

  useEffect(() => {
    if (fetching) {
      fetchStateRef.current = settleFilteredListFetch(fetchStateRef.current, true);
      return;
    }
    // A request that has not flipped `fetching` yet must stay latched. Clearing
    // it here would start a second page before the first one is visible.
    if (fetchStateRef.current.sawFetching) {
      fetchStateRef.current = settleFilteredListFetch(fetchStateRef.current, false);
    }
    if (
      !filteredListShouldFetch({
        fetchFailed,
        fetching,
        hasNextServerPage,
        loadedCount,
        visibleCount,
      })
    ) {
      return;
    }
    const begun = beginFilteredListFetch(fetchStateRef.current, {
      fetchFailed,
      fetching,
      hasNextServerPage,
    });
    fetchStateRef.current = {
      requesting: begun.requesting,
      sawFetching: fetchStateRef.current.sawFetching,
    };
    if (!begun.fetch) return;
    if (!fetchNextRef.current()) {
      fetchStateRef.current = settleFilteredListFetch(
        { requesting: true, sawFetching: false },
        false,
      );
    }
  }, [fetchFailed, fetching, hasNextServerPage, loadedCount, visibleCount]);

  const onEndReached = useCallback(() => {
    const decision = advanceFilteredList({
      fetchFailed,
      fetching,
      hasNextServerPage,
      loadedCount,
      visibleCount,
    });
    if (decision.visibleCount !== visibleCount) {
      setWindowState((current) =>
        current.visibleCount === decision.visibleCount
          ? current
          : { ...current, visibleCount: decision.visibleCount },
      );
    }
    if (!decision.fetch) return;
    const begun = beginFilteredListFetch(fetchStateRef.current, {
      fetchFailed,
      fetching,
      hasNextServerPage,
    });
    fetchStateRef.current = {
      requesting: begun.requesting,
      sawFetching: fetchStateRef.current.sawFetching,
    };
    if (!begun.fetch) return;
    if (!fetchNextRef.current()) {
      fetchStateRef.current = settleFilteredListFetch(
        { requesting: true, sawFetching: false },
        false,
      );
    }
  }, [fetchFailed, fetching, hasNextServerPage, loadedCount, visibleCount]);

  const retry = useCallback(() => {
    if (fetchStateRef.current.requesting || fetching) return;
    const next = retryFilteredListFetch();
    fetchStateRef.current = { requesting: next.requesting, sawFetching: next.sawFetching };
    if (!retryNextRef.current()) {
      fetchStateRef.current = settleFilteredListFetch(
        { requesting: true, sawFetching: false },
        false,
      );
    }
  }, [fetching]);

  const frame = filteredListFirstFrame({
    fetchFailed,
    hasNextServerPage,
    pending: input.pending,
    rows: input.rows,
    visibleCount,
  });
  const status = filteredListStatus({
    fetchFailed,
    fetching,
    hasNextServerPage,
    loadedCount,
    pending: input.pending,
    visibleCount,
  });

  return { frame, onEndReached, retry, status, visibleCount };
}
