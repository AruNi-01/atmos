"use client";

import type { QueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/api/query/query-keys";
import type { ComputerQueryScope } from "@/api/query/query-scope";
import type { QuotaOverviewResponse } from "@/api/ws/quota-usage-api";

const providerOrderWritesInFlight = new Map<string, number>();

function scopeKey(scope: ComputerQueryScope): string {
  return `${scope.activeInstanceId}\0${scope.connectionEpoch}\0${scope.relaySessionRevision}`;
}

export function providerOrderRevision(
  overview: { provider_order_revision?: number } | null | undefined,
): number {
  const value = overview?.provider_order_revision;
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
}

/**
 * Keep the newer provider order. A drag that has not been acknowledged yet
 * stays in the cache even when an older save's overview arrives with a higher
 * revision than the optimistic snapshot.
 */
export function mergeQuotaOverviewSnapshot(
  current: QuotaOverviewResponse | undefined,
  incoming: QuotaOverviewResponse,
  providerOrderWriteInFlight: boolean,
): QuotaOverviewResponse {
  if (!current) return incoming;
  const currentRevision = providerOrderRevision(current);
  const incomingRevision = providerOrderRevision(incoming);
  if (!providerOrderWriteInFlight && incomingRevision >= currentRevision) return incoming;
  return {
    ...incoming,
    provider_order: current.provider_order ?? [],
    provider_order_revision: currentRevision,
  };
}

export function beginQuotaProviderOrderWrite(scope: ComputerQueryScope): void {
  const key = scopeKey(scope);
  providerOrderWritesInFlight.set(key, (providerOrderWritesInFlight.get(key) ?? 0) + 1);
}

export function endQuotaProviderOrderWrite(scope: ComputerQueryScope): void {
  const key = scopeKey(scope);
  const next = (providerOrderWritesInFlight.get(key) ?? 0) - 1;
  if (next <= 0) providerOrderWritesInFlight.delete(key);
  else providerOrderWritesInFlight.set(key, next);
}

export function isQuotaOverviewResponse(data: unknown): data is QuotaOverviewResponse {
  if (!data || typeof data !== "object") return false;
  const value = data as Record<string, unknown>;
  const revision = value.provider_order_revision;
  return (
    typeof value.generated_at === "number" &&
    Array.isArray(value.providers) &&
    value.all !== null &&
    typeof value.all === "object" &&
    Array.isArray(value.partial_failures) &&
    value.auto_refresh !== null &&
    typeof value.auto_refresh === "object" &&
    (value.provider_order == null || Array.isArray(value.provider_order)) &&
    (revision == null || (typeof revision === "number" && Number.isFinite(revision)))
  );
}

/** Authoritative push. A lower `provider_order_revision` does not replace the order. */
export function applyQuotaOverviewUpdated(
  client: QueryClient,
  scope: ComputerQueryScope,
  data: unknown,
): boolean {
  if (!isQuotaOverviewResponse(data)) return false;
  const key = queryKeys.computer.quotaOverview(scope);
  const current = client.getQueryData<QuotaOverviewResponse>(key);
  const inFlight = (providerOrderWritesInFlight.get(scopeKey(scope)) ?? 0) > 0;
  client.setQueryData(key, mergeQuotaOverviewSnapshot(current, data, inFlight));
  return true;
}
