"use client";

import { tokenUsageApi, type TokenUsageOverviewResponse } from "@/api/ws/token-usage-api";
import { mergeTokenUsageOverviews } from "@/features/token-usage/lib/merge-token-usage-overviews";
import type { UniqueComputer } from "@/features/token-usage/lib/unique-computers";
import { allComputersFetchTargets } from "@/features/token-usage/lib/unique-computers";

const FANOUT_CONCURRENCY = 3;

export type FetchAllTokenUsageDeps = {
  fetchCurrent: () => Promise<TokenUsageOverviewResponse>;
  fetchRemote: (serverId: string) => Promise<TokenUsageOverviewResponse>;
  formatMissed: (label: string) => string;
};

async function mapPool<T, R>(
  items: T[],
  limit: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await mapper(items[index]!);
    }
  }
  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

export async function fetchAllComputersTokenUsage(
  devices: UniqueComputer[],
  deps: FetchAllTokenUsageDeps,
): Promise<TokenUsageOverviewResponse> {
  const targets = allComputersFetchTargets(devices);
  if (targets.length === 0) {
    throw new Error("No computers to scan");
  }

  type Outcome =
    | { ok: true; overview: TokenUsageOverviewResponse }
    | { ok: false; label: string };

  const outcomes = await mapPool(targets, FANOUT_CONCURRENCY, async (device): Promise<Outcome> => {
    try {
      if (device.isCurrent) {
        return { ok: true, overview: await deps.fetchCurrent() };
      }
      if (!device.serverId) {
        return { ok: false, label: device.label };
      }
      return { ok: true, overview: await deps.fetchRemote(device.serverId) };
    } catch {
      return { ok: false, label: device.label };
    }
  });

  const successes = outcomes.flatMap((row) => (row.ok ? [row.overview] : []));
  const missedLabels = outcomes.flatMap((row) =>
    row.ok ? [] : [deps.formatMissed(row.label)],
  );

  if (successes.length === 0) {
    throw new Error("none-reached");
  }

  return mergeTokenUsageOverviews(successes, missedLabels);
}

export async function fetchAllComputersTokenUsageLive(
  devices: UniqueComputer[],
  fetchRemote: (serverId: string) => Promise<TokenUsageOverviewResponse>,
  formatMissed: (label: string) => string,
): Promise<TokenUsageOverviewResponse> {
  return fetchAllComputersTokenUsage(devices, {
    fetchCurrent: () =>
      tokenUsageApi.getOverview({
        refresh: true,
        tryCookies: false,
        year: null,
      }),
    fetchRemote,
    formatMissed,
  });
}
