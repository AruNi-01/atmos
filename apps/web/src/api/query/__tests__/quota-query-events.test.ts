import { describe, expect, test } from "bun:test";
import { queryKeys } from "@/api/query/query-keys";
import type { ComputerQueryScope } from "@/api/query/query-scope";
import type { QuotaOverviewResponse } from "@/api/ws/quota-usage-api";
import {
  applyQuotaOverviewUpdated,
  beginQuotaProviderOrderWrite,
  finishQuotaProviderOrderWrite,
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
    provider_order: [],
  };
}

describe("quota-query-events applyQuotaOverviewUpdated", () => {
  test("isQuotaOverviewResponse accepts complete payloads only", () => {
    expect(isQuotaOverviewResponse(sampleOverview())).toBe(true);
    expect(isQuotaOverviewResponse({ ...sampleOverview(), provider_order: undefined })).toBe(true);
    expect(isQuotaOverviewResponse({ ...sampleOverview(), provider_order: "cursor" })).toBe(false);
    expect(isQuotaOverviewResponse({ ...sampleOverview(), provider_order_revision: "1" })).toBe(
      false,
    );
    expect(isQuotaOverviewResponse({ ...sampleOverview(), provider_order_revision: 2 })).toBe(true);
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

  test("a lower provider_order_revision keeps the newer order", () => {
    const client = createAtmosWebQueryClient();
    client.setQueryData(queryKeys.computer.quotaOverview(scope), {
      ...sampleOverview(1),
      provider_order: ["grok", "cursor"],
      provider_order_revision: 2,
    });

    expect(
      applyQuotaOverviewUpdated(client, scope, {
        ...sampleOverview(9),
        provider_order: ["cursor", "grok"],
        provider_order_revision: 1,
      }),
    ).toBe(true);

    expect(client.getQueryData(queryKeys.computer.quotaOverview(scope))).toEqual({
      ...sampleOverview(9),
      provider_order: ["grok", "cursor"],
      provider_order_revision: 2,
    });
  });

  test("a higher provider_order_revision replaces the order", () => {
    const client = createAtmosWebQueryClient();
    const key = queryKeys.computer.quotaOverview(scope);
    client.setQueryData(key, {
      ...sampleOverview(1),
      provider_order: ["cursor", "grok"],
      provider_order_revision: 1,
    });

    applyQuotaOverviewUpdated(client, scope, {
      ...sampleOverview(4),
      provider_order: ["grok", "cursor"],
      provider_order_revision: 2,
    });

    expect(client.getQueryData<ReturnType<typeof sampleOverview>>(key)?.provider_order).toEqual([
      "grok",
      "cursor",
    ]);
  });

  test("an in-flight drag keeps its order when an older save is published", () => {
    const client = createAtmosWebQueryClient();
    const dragScope = { ...scope, connectionEpoch: 7 };
    const dragKey = queryKeys.computer.quotaOverview(dragScope);
    client.setQueryData(dragKey, {
      ...sampleOverview(1),
      provider_order: ["zed", "factory"],
      provider_order_revision: 1,
    });
    beginQuotaProviderOrderWrite(dragScope);

    applyQuotaOverviewUpdated(client, dragScope, {
      ...sampleOverview(8),
      provider_order: ["factory", "zed"],
      provider_order_revision: 3,
    });
    expect(client.getQueryData<ReturnType<typeof sampleOverview>>(dragKey)?.provider_order).toEqual(
      ["zed", "factory"],
    );
    expect(
      client.getQueryData<ReturnType<typeof sampleOverview>>(dragKey)?.provider_order_revision,
    ).toBe(1);

    finishQuotaProviderOrderWrite(client, dragScope);
    expect(client.getQueryData<ReturnType<typeof sampleOverview>>(dragKey)?.provider_order).toEqual(
      ["factory", "zed"],
    );
    expect(
      client.getQueryData<ReturnType<typeof sampleOverview>>(dragKey)?.provider_order_revision,
    ).toBe(3);
  });

  test("a failed drag keeps a newer order that arrived while the save was pending", () => {
    const client = createAtmosWebQueryClient();
    const dragScope = { ...scope, connectionEpoch: 8 };
    const dragKey = queryKeys.computer.quotaOverview(dragScope);
    const previous = {
      ...sampleOverview(1),
      provider_order: ["cursor", "grok"],
      provider_order_revision: 1,
    };
    client.setQueryData(dragKey, {
      ...previous,
      provider_order: ["grok", "cursor"],
    });
    beginQuotaProviderOrderWrite(dragScope);

    applyQuotaOverviewUpdated(client, dragScope, {
      ...sampleOverview(2),
      provider_order: ["zed", "cursor"],
      provider_order_revision: 2,
    });
    applyQuotaOverviewUpdated(client, dragScope, {
      ...sampleOverview(6),
      provider_order: ["factory", "zed"],
      provider_order_revision: 4,
    });
    expect(client.getQueryData<ReturnType<typeof sampleOverview>>(dragKey)?.provider_order).toEqual(
      ["grok", "cursor"],
    );

    client.setQueryData(dragKey, {
      ...sampleOverview(6),
      provider_order: previous.provider_order,
      provider_order_revision: previous.provider_order_revision,
    });
    finishQuotaProviderOrderWrite(client, dragScope);

    expect(client.getQueryData<ReturnType<typeof sampleOverview>>(dragKey)).toMatchObject({
      generated_at: 6,
      provider_order: ["factory", "zed"],
      provider_order_revision: 4,
    });
  });

  test("a settled drag does not roll back to an older order seen while it was pending", () => {
    const client = createAtmosWebQueryClient();
    const dragScope = { ...scope, connectionEpoch: 9 };
    const dragKey = queryKeys.computer.quotaOverview(dragScope);
    client.setQueryData(dragKey, {
      ...sampleOverview(1),
      provider_order: ["zed", "factory"],
      provider_order_revision: 1,
    });
    beginQuotaProviderOrderWrite(dragScope);
    applyQuotaOverviewUpdated(client, dragScope, {
      ...sampleOverview(3),
      provider_order: ["factory", "zed"],
      provider_order_revision: 4,
    });
    client.setQueryData(dragKey, {
      ...sampleOverview(5),
      provider_order: ["grok", "cursor"],
      provider_order_revision: 5,
    });

    finishQuotaProviderOrderWrite(client, dragScope);

    expect(client.getQueryData<ReturnType<typeof sampleOverview>>(dragKey)?.provider_order).toEqual(
      ["grok", "cursor"],
    );
    expect(
      client.getQueryData<ReturnType<typeof sampleOverview>>(dragKey)?.provider_order_revision,
    ).toBe(5);
  });

  test("overlapping drags apply the deferred order only after the last write finishes", () => {
    const client = createAtmosWebQueryClient();
    const dragScope = { ...scope, connectionEpoch: 10 };
    const dragKey = queryKeys.computer.quotaOverview(dragScope);
    client.setQueryData(dragKey, {
      ...sampleOverview(1),
      provider_order: ["cursor", "grok"],
      provider_order_revision: 1,
    });
    beginQuotaProviderOrderWrite(dragScope);
    beginQuotaProviderOrderWrite(dragScope);
    applyQuotaOverviewUpdated(client, dragScope, {
      ...sampleOverview(4),
      provider_order: ["grok", "cursor"],
      provider_order_revision: 4,
    });

    finishQuotaProviderOrderWrite(client, dragScope);
    expect(client.getQueryData<ReturnType<typeof sampleOverview>>(dragKey)?.provider_order).toEqual(
      ["cursor", "grok"],
    );

    finishQuotaProviderOrderWrite(client, dragScope);
    expect(client.getQueryData<ReturnType<typeof sampleOverview>>(dragKey)?.provider_order).toEqual(
      ["grok", "cursor"],
    );
    expect(
      client.getQueryData<ReturnType<typeof sampleOverview>>(dragKey)?.provider_order_revision,
    ).toBe(4);
  });

  test("applyQuotaOverviewUpdated rejects partial payloads", () => {
    const client = createAtmosWebQueryClient();
    const key = queryKeys.computer.quotaOverview(scope);
    client.setQueryData(key, sampleOverview(1));

    expect(applyQuotaOverviewUpdated(client, scope, { providers: [] })).toBe(false);
    expect(client.getQueryData(key)).toEqual(sampleOverview(1));
  });
});
