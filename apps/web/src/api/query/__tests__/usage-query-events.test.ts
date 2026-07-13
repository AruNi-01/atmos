import { describe, expect, test } from "bun:test";
import { queryKeys } from "@/api/query/query-keys";
import type { ComputerQueryScope } from "@/api/query/query-scope";
import type { UsageOverviewResponse } from "@/api/ws/usage-api";
import {
  applyUsageOverviewUpdated,
  isUsageOverviewResponse,
} from "@/features/usage/lib/usage-query-events";
import { createAtmosWebQueryClient } from "@/providers/app/query-client";

const scope: ComputerQueryScope = {
  activeInstanceId: "local",
  connectionEpoch: 1,
  relaySessionRevision: 0,
};

function sampleOverview(generatedAt = 1_700_000_000): UsageOverviewResponse {
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

describe("usage-query-events applyUsageOverviewUpdated", () => {
  test("isUsageOverviewResponse accepts complete payloads only", () => {
    expect(isUsageOverviewResponse(sampleOverview())).toBe(true);
    expect(isUsageOverviewResponse(null)).toBe(false);
    expect(isUsageOverviewResponse({ generated_at: 1, providers: [] })).toBe(false);
    expect(
      isUsageOverviewResponse({
        generated_at: 1,
        providers: [],
        all: null,
      }),
    ).toBe(false);
  });

  test("applyUsageOverviewUpdated patches the default usage overview key", () => {
    const client = createAtmosWebQueryClient();
    const key = queryKeys.computer.usageOverview(scope);
    const overview = sampleOverview(42);

    expect(applyUsageOverviewUpdated(client, scope, overview)).toBe(true);
    expect(client.getQueryData(key)).toEqual(overview);
  });

  test("applyUsageOverviewUpdated rejects partial payloads", () => {
    const client = createAtmosWebQueryClient();
    const key = queryKeys.computer.usageOverview(scope);
    client.setQueryData(key, sampleOverview(1));

    expect(applyUsageOverviewUpdated(client, scope, { providers: [] })).toBe(false);
    expect(client.getQueryData(key)).toEqual(sampleOverview(1));
  });
});
