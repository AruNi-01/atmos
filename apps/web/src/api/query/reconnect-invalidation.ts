"use client";

import type { QueryClient, QueryKey } from "@tanstack/react-query";
import { queryKeys } from "@/api/query/query-keys";
import type { ComputerQueryScope } from "@/api/query/query-scope";

/** Roots invalidated once after a same-target reconnect. Expand at domain cutover. */
export function reconnectInvalidationKeys(scope: ComputerQueryScope): QueryKey[] {
  return [
    queryKeys.computer.system(scope),
    queryKeys.computer.settingsBootstrap(scope),
    queryKeys.computer.quotaOverview(scope),
    [...queryKeys.computer.root(scope), "tokenUsage"] as const,
    queryKeys.computer.projectBootstrap(scope),
    queryKeys.computer.filesRoot(scope),
    // Git: invalidate all repos via prefix — individual repo paths are unknown at reconnect time.
    queryKeys.computer.gitAll(scope),
    queryKeys.computer.skillsList(scope),
    queryKeys.computer.automationList(scope),
    [...queryKeys.computer.root(scope), "automations"] as const,
    [...queryKeys.computer.root(scope), "github"] as const,
    [...queryKeys.computer.root(scope), "review"] as const,
    [...queryKeys.computer.root(scope), "localModels"] as const,
    [...queryKeys.computer.root(scope), "localServices"] as const,
    [...queryKeys.computer.root(scope), "resourceMonitor"] as const,
    [...queryKeys.computer.root(scope), "agentRegistry"] as const,
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
