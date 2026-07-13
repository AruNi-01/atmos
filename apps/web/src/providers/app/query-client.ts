"use client";

import { QueryClient } from "@tanstack/react-query";

export function createAtmosWebQueryClient(
  overrides?: ConstructorParameters<typeof QueryClient>[0],
): QueryClient {
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
  if (!browserQueryClient) {
    browserQueryClient = createAtmosWebQueryClient();
  }
  return browserQueryClient;
}

/** Test-only: reset the browser singleton between suites. */
export function __resetAtmosWebQueryClientForTests(): void {
  browserQueryClient = null;
}
