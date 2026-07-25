"use client";

import { useEffect } from "react";
import {
  useQuery,
  type UseQueryOptions,
  type UseQueryResult,
  type QueryKey,
} from "@tanstack/react-query";
import { useSessionListSnapshotStore } from "@/features/workspace/store/session-list-snapshot-store";

/**
 * useQuery wrapper that seeds from the session list snapshot store and writes
 * successful results back. When the user returns to a workspace after a long
 * idle period, paint uses the session snapshot even if Query already GC'd.
 */
export function useSessionListQuery<
  TQueryFnData = unknown,
  TError = Error,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
>(
  sessionKey: string | null,
  options: UseQueryOptions<TQueryFnData, TError, TData, TQueryKey>,
): UseQueryResult<TData, TError> {
  const query = useQuery({
    ...options,
    initialData: () => {
      if (!sessionKey) return undefined;
      // Seed Query from session snapshot so isLoading is false on warm hops.
      return useSessionListSnapshotStore.getState().get<TQueryFnData>(sessionKey);
    },
    initialDataUpdatedAt: () => {
      if (!sessionKey) return undefined;
      return useSessionListSnapshotStore.getState().getUpdatedAt(sessionKey);
    },
  } as UseQueryOptions<TQueryFnData, TError, TData, TQueryKey>);

  useEffect(() => {
    if (!sessionKey) return;
    if (!query.isSuccess || query.data === undefined) return;
    // Persist paint snapshot for the rest of the computer session.
    useSessionListSnapshotStore
      .getState()
      .set(sessionKey, query.data as unknown as TQueryFnData, query.dataUpdatedAt);
  }, [sessionKey, query.isSuccess, query.data, query.dataUpdatedAt]);

  return query;
}
