import { useCallback, useEffect, useRef, useState } from "react";
import {
  advanceFilteredList,
  beginFilteredListFetch,
  FILTERED_LIST_PAGE_SIZE,
  filteredListFirstFrame,
  filteredListShouldFetch,
  filteredListStatus,
  reduceFilteredListWindow,
  releaseFilteredListFetch,
  retryFilteredListFetch,
  type FilteredListFetchLatch,
  type FilteredListWindowState,
} from "./filtered-list-page";

type PageRequest = () => boolean | Promise<boolean>;

type FetchSnapshot = {
  fetchFailed: boolean;
  fetching: boolean;
  hasNextServerPage: boolean;
  loadedCount: number;
  visibleCount: number;
};

/**
 * UI window of 20 rows. Filter changes and server-page growth update state
 * during render. The in-flight latch lives in a ref. It is taken when a page
 * request starts and released when that request's promise settles, so a fast
 * response that never paints `fetching` still unlocks the next page.
 */
export function useFilteredListWindow<T>(input: {
  filterKey: string;
  rows: readonly T[];
  pending: boolean;
  hasNextServerPage: boolean;
  fetching: boolean;
  fetchFailed: boolean;
  fetchNext: PageRequest;
  retryNext: PageRequest;
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

  const fetchStateRef = useRef<FilteredListFetchLatch>({ requesting: false, generation: 0 });
  const effectEpochRef = useRef(0);
  const latestRef = useRef<FetchSnapshot>({
    fetchFailed: false,
    fetching: false,
    hasNextServerPage: false,
    loadedCount: 0,
    visibleCount: FILTERED_LIST_PAGE_SIZE,
  });
  const fetchNextRef = useRef<PageRequest>(input.fetchNext);
  const retryNextRef = useRef<PageRequest>(input.retryNext);
  const startRequestRef = useRef<(latch: FilteredListFetchLatch, request: PageRequest) => void>(
    () => undefined,
  );

  const startRequest = useCallback((latch: FilteredListFetchLatch, request: PageRequest) => {
    const epoch = effectEpochRef.current;
    let started: boolean | Promise<boolean>;
    try {
      started = request();
    } catch {
      fetchStateRef.current = releaseFilteredListFetch(latch, latch.generation);
      return;
    }
    void Promise.resolve(started)
      .then(
        () => undefined,
        () => undefined,
      )
      .finally(() => {
        const current = fetchStateRef.current;
        if (current.generation !== latch.generation) return;
        fetchStateRef.current = releaseFilteredListFetch(current, latch.generation);
        // A render may have already run the fill effect while this request
        // was still latched. Props will not change again, so continue once.
        if (effectEpochRef.current === epoch) return;
        const latest = latestRef.current;
        if (!filteredListShouldFetch(latest)) return;
        const begun = beginFilteredListFetch(fetchStateRef.current, latest);
        if (!begun.fetch) return;
        fetchStateRef.current = begun.latch;
        startRequestRef.current(begun.latch, () => fetchNextRef.current());
      });
  }, []);

  useEffect(() => {
    startRequestRef.current = startRequest;
  }, [startRequest]);

  useEffect(() => {
    fetchNextRef.current = input.fetchNext;
    retryNextRef.current = input.retryNext;
  }, [input.fetchNext, input.retryNext]);

  const { fetchFailed, fetching, hasNextServerPage } = input;

  useEffect(() => {
    effectEpochRef.current += 1;
    const latest = { fetchFailed, fetching, hasNextServerPage, loadedCount, visibleCount };
    latestRef.current = latest;
    if (!filteredListShouldFetch(latest)) return;
    const begun = beginFilteredListFetch(fetchStateRef.current, latest);
    if (!begun.fetch) return;
    fetchStateRef.current = begun.latch;
    startRequest(begun.latch, () => fetchNextRef.current());
  }, [fetchFailed, fetching, hasNextServerPage, loadedCount, startRequest, visibleCount]);

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
    if (!begun.fetch) return;
    fetchStateRef.current = begun.latch;
    startRequest(begun.latch, () => fetchNextRef.current());
  }, [fetchFailed, fetching, hasNextServerPage, loadedCount, startRequest, visibleCount]);

  const retry = useCallback(() => {
    if (fetchStateRef.current.requesting || fetching) return;
    const next = retryFilteredListFetch(fetchStateRef.current);
    fetchStateRef.current = next.latch;
    startRequest(next.latch, () => retryNextRef.current());
  }, [fetching, startRequest]);

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
