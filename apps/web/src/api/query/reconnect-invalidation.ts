"use client";

import type { QueryClient, QueryKey } from "@tanstack/react-query";
import { queryKeys } from "@/api/query/query-keys";
import type { ComputerQueryScope } from "@/api/query/query-scope";

/** Roots invalidated once after a same-target reconnect. Expand at domain cutover. */
export function reconnectInvalidationKeys(scope: ComputerQueryScope): QueryKey[] {
  return [
    queryKeys.computer.system(scope),
    queryKeys.computer.settingsBootstrap(scope),
    queryKeys.computer.usageOverview(scope),
    queryKeys.computer.projectBootstrap(scope),
    queryKeys.computer.filesRoot(scope),
    // Git: invalidate all repos via prefix — individual repo paths are unknown at reconnect time.
    queryKeys.computer.gitAll(scope),
  ];
}

export async function invalidateAfterComputerReconnect(
  client: QueryClient,
  scope: ComputerQueryScope,
): Promise<void> {
  await Promise.all(
    reconnectInvalidationKeys(scope).map((queryKey) =>
      client.invalidateQueries({ queryKey, refetchType: "active" }),
    ),
  );
}
