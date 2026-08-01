import { describe, expect, test } from "bun:test";
import { queryKeys } from "@/api/query/query-keys";
import type { ComputerQueryScope } from "@/api/query/query-scope";
import type { QuotaOverviewResponse } from "@/api/ws/quota-usage-api";
import {
  applyQuotaOverviewUpdated,
  isQuotaOverviewResponse,
} from "@/features/quota-usage/lib/quota-query-events";
import { createAtmosWebQueryClient } from "@/providers/app/query-client";

const scope: ComputerQueryScope = {
  activeInstanceId: "local",
  connectionEpoch: 1,
  relaySessionRevision: 0,
};

function sampleOverview(generatedAt = 1_700_000_000): QuotaOverviewResponse {
  return {
    generated_at: generatedAt,
    providers: [],
    all: {
      enabled_count: 0,
      total_count: 0,
      active_subscription_count: 0,
      comparable_credit_currency: null,
      total_credits_used: null,
      total_credits_remaining: null,
      near_limit_sources: [],
      degraded_sources: [],
      soonest_reset_at: null,
    },
    partial_failures: [],
    auto_refresh: { interval_minutes: null },
  };
}

describe("quota-query-events applyQuotaOverviewUpdated", () => {
  test("isQuotaOverviewResponse accepts complete payloads only", () => {
    expect(isQuotaOverviewResponse(sampleOverview())).toBe(true);
    expect(isQuotaOverviewResponse(null)).toBe(false);
    expect(isQuotaOverviewResponse({ generated_at: 1, providers: [] })).toBe(false);
    expect(
      isQuotaOverviewResponse({
        generated_at: 1,
        providers: [],
        all: null,
      }),
    ).toBe(false);
    expect(
      isQuotaOverviewResponse({
        generated_at: 1,
        providers: [],
        all: sampleOverview().all,
      }),
    ).toBe(false);
    expect(
      isQuotaOverviewResponse({
        generated_at: 1,
        providers: [],
        all: sampleOverview().all,
        partial_failures: [],
        auto_refresh: null,
      }),
    ).toBe(false);
  });

  test("applyQuotaOverviewUpdated patches the default usage overview key", () => {
    const client = createAtmosWebQueryClient();
    const key = queryKeys.computer.quotaOverview(scope);
    const overview = sampleOverview(42);

    expect(applyQuotaOverviewUpdated(client, scope, overview)).toBe(true);
    expect(client.getQueryData(key)).toEqual(overview);
  });

  test("applyQuotaOverviewUpdated rejects partial payloads", () => {
    const client = createAtmosWebQueryClient();
    const key = queryKeys.computer.quotaOverview(scope);
    client.setQueryData(key, sampleOverview(1));

    expect(applyQuotaOverviewUpdated(client, scope, { providers: [] })).toBe(false);
    expect(client.getQueryData(key)).toEqual(sampleOverview(1));
  });
});
