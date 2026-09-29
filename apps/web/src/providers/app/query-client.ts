"use client";

import { Query, QueryClient, type QueryKey } from "@tanstack/react-query";
import { isCancelledError } from "@/shared/lib/is-cancelled-error";

const inFlightFetches = new WeakMap<Query, Promise<unknown>>();
const cancellationGuardWindows = new WeakSet<object>();

function trackQueryFetches(): void {
  const proto = Query.prototype as Query & { __atmosFetchTracked?: boolean };
  if (proto.__atmosFetchTracked) return;
  const original = Query.prototype.fetch;
  Query.prototype.fetch = function trackedFetch(
    this: Query,
    ...args: Parameters<Query["fetch"]>
  ) {
    const promise = original.apply(this, args);
    inFlightFetches.set(this, promise);
    return promise;
  } as Query["fetch"];
  proto.__atmosFetchTracked = true;
}

trackQueryFetches();

/**
 * Next.js dev overlay treats an unhandled `CancelledError` as a Runtime Error.
 * Cancellation is the expected result of dropping a Computer/Relay query root.
 * Capture phase runs before the overlay's bubble listener.
 */
export function installQueryCancellationGuard(target: Window): void {
  if (cancellationGuardWindows.has(target)) return;
  cancellationGuardWindows.add(target);
  target.addEventListener(
    "unhandledrejection",
    (event) => {
      if (!isCancelledError(event.reason)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    },
    true,
  );
}

function silenceInFlightQueryCancellations(client: QueryClient, queryKey: QueryKey): void {
  for (const query of client.getQueryCache().findAll({ queryKey })) {
    if (query.state.fetchStatus === "idle") continue;
    const promise = inFlightFetches.get(query);
    if (!promise) continue;
    promise.catch((error: unknown) => {
      if (isCancelledError(error)) return;
    });
  }
}

/** Cancel in-flight fetches, then drop the cache entries for `queryKey`. */
export async function cancelAndRemoveQueries(queryKey: QueryKey): Promise<void> {
  const client = getAtmosWebQueryClient();
  silenceInFlightQueryCancellations(client, queryKey);
  await client.cancelQueries({ queryKey });
  client.removeQueries({ queryKey });
}

export function createAtmosWebQueryClient(
  overrides?: ConstructorParameters<typeof QueryClient>[0],
): QueryClient {
  if (typeof window !== "undefined") {
    installQueryCancellationGuard(window);
  }
  return new QueryClient({
    ...overrides,
    defaultOptions: {
      queries: {
        staleTime: 15_000,
        retry: 1,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        ...overrides?.defaultOptions?.queries,
      },
      mutations: {
        retry: 0,
        ...overrides?.defaultOptions?.mutations,
      },
    },
  });
}

let browserQueryClient: QueryClient | null = null;

/** Singleton for browser lifecycle / event modules. Tests should use createAtmosWebQueryClient(). */
export function getAtmosWebQueryClient(): QueryClient {
  if (typeof window === "undefined") {
    throw new Error("getAtmosWebQueryClient() is browser-only");
  }
  installQueryCancellationGuard(window);
  if (!browserQueryClient) {
    browserQueryClient = createAtmosWebQueryClient();
  }
  return browserQueryClient;
}

/** Test-only: reset the browser singleton between suites. */
export function __resetAtmosWebQueryClientForTests(): void {
  browserQueryClient = null;
}
