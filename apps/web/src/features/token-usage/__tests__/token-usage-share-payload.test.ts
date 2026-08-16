// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, it } from "bun:test";
import type { TokenUsageOverviewResponse } from "@/api/ws/token-usage-api";
import {
  SHARE_TOP_N,
  inflateSharePayload,
  isSharePayload,
  mapOverviewToSharePayload,
} from "@/features/token-usage/token-usage-share-payload";
import { buildPublicTokPreview } from "@/features/token-usage/public-tok-preview";
import {
  BREAKDOWN_OTHER_ID,
  buildBreakdownSeries,
  buildOverviewBreakdownShares,
} from "@/features/token-usage/token-usage-dialog-utils";

function overviewFixture(): TokenUsageOverviewResponse {
  const clients = Array.from({ length: 12 }, (_, i) => ({
    client_id: `agent-${i}`,
    total_tokens: 1000 - i * 10,
    total_cost_usd: 10 - i * 0.1,
    message_count: 10,
    model_count: 1,
  }));
  const models = Array.from({ length: 12 }, (_, i) => ({
    client_id: `agent-${i % 3}`,
    provider_id: i % 2 === 0 ? "anthropic" : "openai",
    model_id: `model-${i}`,
    input_tokens: 10,
    output_tokens: 10,
    cache_read_tokens: 1,
    cache_write_tokens: 1,
    reasoning_tokens: 1,
    total_tokens: 900 - i * 5,
    cost_usd: 9 - i * 0.05,
    message_count: 4,
  }));
  return {
    query: { group_by: "client_provider_model" },
    summary: {
      total_tokens: 50_000,
      total_cost_usd: 42,
      total_messages: 200,
      active_days: 3,
      range_start: "2026-01-01",
      range_end: "2026-01-03",
      processing_time_ms: 1,
    },
    by_client: clients,
    by_model: models,
    by_day: [
      {
        date: "2026-01-01",
        breakdown: {
          input_tokens: 100,
          output_tokens: 50,
          cache_read_tokens: 10,
          cache_write_tokens: 5,
          reasoning_tokens: 5,
          total_tokens: 170,
        },
        total_tokens: 170,
        total_cost_usd: 1.5,
        message_count: 8,
        by_client: clients.map((c, i) => ({
          client_id: c.client_id,
          model_id: `model-${i}`,
          provider_id: "anthropic",
          breakdown: {
            input_tokens: 1,
            output_tokens: 1,
            cache_read_tokens: 0,
            cache_write_tokens: 0,
            reasoning_tokens: 0,
            total_tokens: c.total_tokens,
          },
          total_tokens: 20,
          cost_usd: 0.2,
          message_count: 1,
        })),
      },
    ],
    by_month: [],
    available_years: ["2026"],
    generated_at: 99,
    partial_warnings: ["ignored"],
    browser_cookie_access: [],
  };
}

describe("mapOverviewToSharePayload", () => {
  it("keeps top 5 + other and full summary totals", () => {
    const payload = mapOverviewToSharePayload(overviewFixture(), {
      includeCost: false,
    });
    expect(payload.schema_version).toBe(2);
    expect(payload.by_client).toHaveLength(SHARE_TOP_N);
    expect(payload.by_model).toHaveLength(SHARE_TOP_N);
    expect(payload.summary.total_tokens).toBe(50_000);
    expect(payload.summary.client_count).toBe(12);
    expect(payload.summary.model_count).toBe(12);
    expect(payload.summary.total_cost_usd).toBeUndefined();
    const day = payload.by_day[0]!;
    expect(day.agents.some((r) => r.id === "other")).toBe(true);
    expect(day.models.some((r) => r.id === "other")).toBe(true);
    expect(day.agents.filter((r) => r.id !== "other").length).toBeLessThanOrEqual(
      SHARE_TOP_N,
    );
    expect(JSON.stringify(payload)).not.toContain("prompt");
    expect(JSON.stringify(payload)).not.toContain("partial_warnings");
    expect(JSON.stringify(payload)).not.toContain("browser_cookie");
  });

  it("omits cost fields when not included", () => {
    const payload = mapOverviewToSharePayload(overviewFixture(), {
      includeCost: false,
    });
    expect(JSON.stringify(payload)).not.toContain("cost");
  });

  it("includes cost when requested", () => {
    const payload = mapOverviewToSharePayload(overviewFixture(), {
      includeCost: true,
    });
    expect(payload.summary.total_cost_usd).toBe(42);
    expect(payload.by_day[0]?.total_cost_usd).toBe(1.5);
  });

  it("dev preview fixture is a valid share payload", () => {
    const preview = buildPublicTokPreview();
    expect(preview.handle).toBe("preview");
    expect(isSharePayload(preview.snapshot)).toBe(true);
    expect(preview.snapshot.by_day.length).toBeGreaterThan(10);
  });

  it("inflates back for the shared overview view", () => {
    const payload = mapOverviewToSharePayload(overviewFixture(), {
      includeCost: false,
    });
    const overview = inflateSharePayload(payload, "agent");
    expect(overview.summary.total_tokens).toBe(50_000);
    expect(overview.by_client.length).toBeGreaterThanOrEqual(SHARE_TOP_N);
    expect(overview.by_day[0]?.by_client.some((r) => r.client_id === "other")).toBe(
      true,
    );
    const asModel = inflateSharePayload(payload, "model");
    expect(asModel.by_day[0]?.by_client.some((r) => r.model_id === "other")).toBe(
      true,
    );
    const shares = buildOverviewBreakdownShares(overview, "tokens", "agent");
    expect(shares.slice(0, SHARE_TOP_N).every((row) => row.id !== "other")).toBe(
      true,
    );
    expect(shares.some((row) => row.id === BREAKDOWN_OTHER_ID)).toBe(true);
    const series = buildBreakdownSeries(
      overview.by_day,
      "day",
      "en",
      "tokens",
      "agent",
    );
    expect(series.keys.slice(0, SHARE_TOP_N)).not.toContain("other");
    expect(series.keys.at(-1)).toBe(BREAKDOWN_OTHER_ID);
  });

  it("does not promote an existing other client into the shared top-N", () => {
    const base = overviewFixture();
    const payload = mapOverviewToSharePayload(
      {
        ...base,
        by_client: [
          {
            client_id: "other",
            total_tokens: 40_000,
            total_cost_usd: 20,
            message_count: 80,
            model_count: 1,
          },
          ...(base.by_client ?? []),
        ],
      },
      { includeCost: false },
    );
    expect(payload.by_client.map((row) => row.id)).not.toContain("other");
    expect(payload.by_client).toHaveLength(SHARE_TOP_N);
  });
});
