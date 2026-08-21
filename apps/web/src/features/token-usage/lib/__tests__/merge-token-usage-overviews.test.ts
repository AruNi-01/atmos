// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, it } from "bun:test";
import type {
  TokenBreakdownResponse,
  TokenUsageOverviewResponse,
} from "@/api/ws/token-usage-api";
import { mergeTokenUsageOverviews } from "@/features/token-usage/lib/merge-token-usage-overviews";

const zero: TokenBreakdownResponse = {
  input_tokens: 0,
  output_tokens: 0,
  cache_read_tokens: 0,
  cache_write_tokens: 0,
  reasoning_tokens: 0,
  total_tokens: 0,
};

function overview(
  partial: Partial<TokenUsageOverviewResponse> & {
    total_tokens: number;
    days: string[];
    active_days?: number;
    total_cost_usd?: number | null;
  },
): TokenUsageOverviewResponse {
  return {
    query: { group_by: "model", year: null, since: null, until: null, clients: null },
    summary: {
      total_tokens: partial.total_tokens,
      total_cost_usd: partial.total_cost_usd === undefined ? 1 : partial.total_cost_usd,
      total_messages: partial.total_tokens / 10,
      active_days: partial.active_days ?? partial.days.length,
      range_start: partial.days[0] ?? null,
      range_end: partial.days.at(-1) ?? null,
      processing_time_ms: 5,
    },
    by_client: [],
    by_model: [],
    by_day: partial.days.map((date) => ({
      date,
      breakdown: { ...zero, total_tokens: 10 },
      total_tokens: 10,
      total_cost_usd: partial.total_cost_usd === undefined ? 0.1 : partial.total_cost_usd,
      message_count: 1,
      by_client: [],
    })),
    by_month: [],
    available_years: ["2026"],
    generated_at: 10,
    partial_warnings: [],
    ...partial,
  };
}

describe("mergeTokenUsageOverviews", () => {
  it("sums tokens and unions active days", () => {
    const merged = mergeTokenUsageOverviews([
      overview({
        total_tokens: 100,
        days: ["2026-01-01", "2026-01-02"],
        active_days: 2,
      }),
      overview({
        total_tokens: 50,
        days: ["2026-01-02", "2026-01-03"],
        active_days: 2,
      }),
    ]);
    expect(merged.summary.total_tokens).toBe(40);
    expect(merged.by_day.map((d) => d.date)).toEqual([
      "2026-01-01",
      "2026-01-02",
      "2026-01-03",
    ]);
    expect(merged.summary.active_days).toBe(3);
  });

  it("nulls cost when any contributor lacks cost", () => {
    const merged = mergeTokenUsageOverviews([
      overview({ total_tokens: 10, days: ["2026-01-01"], total_cost_usd: 1.5 }),
      overview({ total_tokens: 10, days: ["2026-01-02"], total_cost_usd: null }),
    ]);
    expect(merged.summary.total_cost_usd).toBeNull();
  });

  it("appends missed labels and omits cookie access", () => {
    const merged = mergeTokenUsageOverviews(
      [overview({ total_tokens: 10, days: ["2026-01-01"] })],
      ["VPS was not included"],
    );
    expect(merged.partial_warnings).toContain("VPS was not included");
    expect(merged.browser_cookie_access).toBeUndefined();
  });

  it("rejects an empty contributor list", () => {
    expect(() => mergeTokenUsageOverviews([])).toThrow(/zero/i);
  });

  it("does not double-count the same Cursor cloud account", () => {
    const laptop = withClients(overview({ total_tokens: 0, days: [] }), {
      claude: [80, "2026-01-01"],
      cursor: [100, "2026-01-01"],
    });
    const desktop = withClients(overview({ total_tokens: 0, days: [] }), {
      claude: [20, "2026-01-01"],
      cursor: [100, "2026-01-01"],
    });
    const merged = mergeTokenUsageOverviews([laptop, desktop]);
    expect(clientTokens(merged, "claude")).toBe(100);
    expect(clientTokens(merged, "cursor")).toBe(100);
    expect(merged.summary.total_tokens).toBe(200);
    expect(merged.computer_count).toBe(2);
  });

  it("sums Cursor usage from different accounts", () => {
    const work = withClients(overview({ total_tokens: 0, days: [] }), {
      cursor: [100, "2026-01-01"],
    });
    const personal = withClients(overview({ total_tokens: 0, days: [] }), {
      cursor: [40, "2026-01-01"],
    });
    const merged = mergeTokenUsageOverviews([work, personal]);
    expect(clientTokens(merged, "cursor")).toBe(140);
  });
});

function clientTokens(overview: TokenUsageOverviewResponse, clientId: string): number {
  return overview.by_client
    .filter((row) => row.client_id === clientId)
    .reduce((sum, row) => sum + row.total_tokens, 0);
}

function withClients(
  base: TokenUsageOverviewResponse,
  clients: Record<string, [tokens: number, date: string]>,
): TokenUsageOverviewResponse {
  const by_client = Object.entries(clients).map(([client_id, [tokens]]) => ({
    client_id,
    total_tokens: tokens,
    total_cost_usd: 1,
    message_count: 1,
    model_count: 1,
  }));
  const by_day = Object.values(
    Object.entries(clients).reduce<Record<string, TokenUsageOverviewResponse["by_day"][number]>>(
      (days, [client_id, [tokens, date]]) => {
        const row = {
          client_id,
          model_id: "m",
          provider_id: client_id === "cursor" ? "cursor" : "anthropic",
          breakdown: {
            input_tokens: tokens,
            output_tokens: 0,
            cache_read_tokens: 0,
            cache_write_tokens: 0,
            reasoning_tokens: 0,
            total_tokens: tokens,
          },
          total_tokens: tokens,
          cost_usd: 1,
          message_count: 1,
        };
        const existing = days[date];
        if (!existing) {
          days[date] = {
            date,
            breakdown: { ...row.breakdown },
            total_tokens: tokens,
            total_cost_usd: 1,
            message_count: 1,
            by_client: [row],
          };
          return days;
        }
        existing.by_client.push(row);
        existing.total_tokens += tokens;
        existing.message_count += 1;
        existing.breakdown.input_tokens += tokens;
        existing.breakdown.total_tokens += tokens;
        return days;
      },
      {},
    ),
  );
  return {
    ...base,
    summary: {
      ...base.summary,
      total_tokens: by_client.reduce((sum, row) => sum + row.total_tokens, 0),
    },
    by_client,
    by_day,
  };
}
