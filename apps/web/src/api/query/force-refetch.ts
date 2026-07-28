"use client";

import type { QueryClient, QueryKey, RefetchOptions } from "@tanstack/react-query";
import { getAtmosWebQueryClient } from "@/providers/app/query-client";

/**
 * Product rule for server-list data:
 *
 * - **User clicks Refresh** → force re-run queryFn (this module).
 * - **User navigates into a page/tab** → paint from Query cache / session-list
 *   snapshot; do not force a network round-trip on every hop.
 *
 * `refetch` ignores `staleTime`; session-list `initialData` only seeds paint on
 * mount and does not block an explicit refetch.
 */
export const FORCE_REFETCH_OPTIONS = {
  /** Drop any in-flight soft fetch so the user-initiated request wins. */
  cancelRefetch: true,
} as const satisfies RefetchOptions;

/** Force active observers for `queryKey` to re-execute queryFn now. */
export async function forceRefetchActiveQueries(
  queryKey: QueryKey,
  client: QueryClient = getAtmosWebQueryClient(),
): Promise<void> {
  await client.refetchQueries({
    queryKey,
    type: "active",
    ...FORCE_REFETCH_OPTIONS,
  });
}
