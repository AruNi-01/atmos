"use client";

import type {
  InfiniteData,
  QueryKey,
  UseInfiniteQueryOptions,
  UseQueryOptions,
} from "@tanstack/react-query";
import type { ComputerQueryScope } from "@/api/query/query-scope";

type ConnectionState = "connecting" | "connected" | "disconnected" | "reconnecting";

export function wsComputerQueryEnabled(
  scope: ComputerQueryScope | null | undefined,
  connectionState: ConnectionState,
): boolean {
  return Boolean(scope?.activeInstanceId) && connectionState === "connected";
}

/**
 * REST Computer reads need a resolvable HTTP target, not the main WebSocket.
 * runtimeReady: local loopback available, or Relay gateway session is complete.
 */
export function restComputerQueryEnabled(
  scope: ComputerQueryScope | null | undefined,
  runtimeReady: boolean,
): boolean {
  return Boolean(scope?.activeInstanceId) && runtimeReady;
}

function resolveWsRetry<TError>(
  connectionState: ConnectionState,
  retry:
    | boolean
    | number
    | ((failureCount: number, error: TError) => boolean)
    | undefined,
  failureCount: number,
  error: TError,
): boolean {
  if (connectionState !== "connected") return false;
  if (typeof retry === "function") return retry(failureCount, error);
  if (typeof retry === "number") return failureCount < retry;
  if (typeof retry === "boolean") return retry && failureCount < 1;
  return failureCount < 1;
}

export function wsQueryOptions<
  TQueryFnData,
  TError = Error,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
>(
  options: UseQueryOptions<TQueryFnData, TError, TData, TQueryKey> & {
    connectionState: ConnectionState;
    scope: ComputerQueryScope;
  },
): UseQueryOptions<TQueryFnData, TError, TData, TQueryKey> {
  const { connectionState, scope, enabled, retry, ...rest } = options;
  const connectionEnabled = wsComputerQueryEnabled(scope, connectionState);

  return {
    ...rest,
    enabled: (enabled ?? true) && connectionEnabled,
    retry: (failureCount, error) =>
      resolveWsRetry(connectionState, retry, failureCount, error),
  };
}

export function wsInfiniteQueryOptions<
  TQueryFnData,
  TError = Error,
  TData = InfiniteData<TQueryFnData>,
  TQueryKey extends QueryKey = QueryKey,
  TPageParam = unknown,
>(
  options: UseInfiniteQueryOptions<TQueryFnData, TError, TData, TQueryKey, TPageParam> & {
    connectionState: ConnectionState;
    scope: ComputerQueryScope;
  },
): UseInfiniteQueryOptions<TQueryFnData, TError, TData, TQueryKey, TPageParam> {
  const { connectionState, scope, enabled, retry, ...rest } = options;
  const connectionEnabled = wsComputerQueryEnabled(scope, connectionState);

  return {
    ...rest,
    enabled: (enabled ?? true) && connectionEnabled,
    retry: (failureCount, error) =>
      resolveWsRetry(connectionState, retry, failureCount, error),
  };
}

export function restComputerQueryOptions<
  TQueryFnData,
  TError = Error,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
>(
  options: UseQueryOptions<TQueryFnData, TError, TData, TQueryKey> & {
    scope: ComputerQueryScope;
    runtimeReady: boolean;
  },
): UseQueryOptions<TQueryFnData, TError, TData, TQueryKey> {
  const { scope, runtimeReady, enabled, ...rest } = options;
  return {
    ...rest,
    enabled: (enabled ?? true) && restComputerQueryEnabled(scope, runtimeReady),
  };
}
