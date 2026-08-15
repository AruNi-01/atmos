import { describe, expect, test } from "bun:test";

import {
  BREAKDOWN_OTHER_ID,
  BREAKDOWN_TOP_N,
  buildModelProviderMap,
  buildOverviewBreakdownShares,
  formatCompactNumber,
  formatCurrencyCompact,
  inferProviderIdFromModel,
  primaryProviderSegment,
  rankTopNWithOther,
  resolveTokenUsageModelIconSrc,
} from "@/app-shell/token-usage-dialog-utils";

describe("resolveTokenUsageModelIconSrc", () => {
  test("maps anthropic / openai / google providers to brand assets", () => {
    expect(resolveTokenUsageModelIconSrc("anthropic", "claude-opus-4")).toBe(
      "/ai-provider/claude.svg",
    );
    expect(resolveTokenUsageModelIconSrc("openai", "gpt-5")).toBe(
      "/ai-provider/codex.svg",
    );
    expect(resolveTokenUsageModelIconSrc("google", "gemini-2.5-pro")).toBe(
      "/ai-provider/gemini.svg",
    );
    expect(resolveTokenUsageModelIconSrc("xai", "grok-3")).toBe(
      "/ai-provider/grok.svg",
    );
    expect(resolveTokenUsageModelIconSrc("moonshotai", "kimi-k2.5")).toBe(
      "/ai-provider/kimi.svg",
    );
  });

  test("infers provider from model id when provider is missing", () => {
    expect(resolveTokenUsageModelIconSrc(null, "claude-sonnet-4")).toBe(
      "/ai-provider/claude.svg",
    );
    expect(resolveTokenUsageModelIconSrc("", "gpt-4.1")).toBe(
      "/ai-provider/codex.svg",
    );
    expect(resolveTokenUsageModelIconSrc(undefined, "gemini-2.0-flash")).toBe(
      "/ai-provider/gemini.svg",
    );
  });

  test("handles merged provider ids and agent-icon fallbacks", () => {
    expect(primaryProviderSegment("openai, anthropic")).toBe("openai");
    expect(resolveTokenUsageModelIconSrc("openai, anthropic", "gpt-4o")).toBe(
      "/ai-provider/codex.svg",
    );
    expect(resolveTokenUsageModelIconSrc("qwen", "qwen3-coder")).toBe(
      "/agents/qwen-code.svg",
    );
  });

  test("returns null for unknown families", () => {
    expect(resolveTokenUsageModelIconSrc("deepseek", "deepseek-r1")).toBeNull();
    expect(inferProviderIdFromModel("deepseek-r1")).toBe("deepseek");
  });
});

describe("rankTopNWithOther", () => {
  test("keeps a large other bucket out of the top-N slots", () => {
    const totals = new Map<string, number>([
      ["other", 10_000],
      ["claude", 400],
      ["codex", 300],
      ["gemini", 200],
      ["kimi", 100],
      ["grok", 50],
      ["tiny", 10],
    ]);
    const ranked = rankTopNWithOther(totals, BREAKDOWN_TOP_N);
    expect(ranked.slice(0, BREAKDOWN_TOP_N).map(([id]) => id)).toEqual([
      "claude",
      "codex",
      "gemini",
      "kimi",
      "grok",
    ]);
    expect(ranked[BREAKDOWN_TOP_N]).toEqual([BREAKDOWN_OTHER_ID, 10_010]);
  });
});

describe("buildOverviewBreakdownShares providerId", () => {
  test("does not let a residual other row occupy a top-5 slot", () => {
    const shares = buildOverviewBreakdownShares(
      {
        by_client: [
          { client_id: "other", total_tokens: 50_000, total_cost_usd: 10 },
          { client_id: "claude", total_tokens: 800, total_cost_usd: 2 },
          { client_id: "codex", total_tokens: 700, total_cost_usd: 1 },
          { client_id: "gemini", total_tokens: 600, total_cost_usd: 1 },
          { client_id: "kimi", total_tokens: 500, total_cost_usd: 1 },
          { client_id: "grok", total_tokens: 400, total_cost_usd: 1 },
        ],
        by_model: [],
      },
      "tokens",
      "agent",
    );
    expect(shares.slice(0, BREAKDOWN_TOP_N).map((row) => row.id)).toEqual([
      "claude",
      "codex",
      "gemini",
      "kimi",
      "grok",
    ]);
    expect(shares.at(-1)?.id).toBe(BREAKDOWN_OTHER_ID);
    expect(shares.at(-1)?.value).toBe(50_000);
  });

  test("attaches dominant provider for model rows", () => {
    const shares = buildOverviewBreakdownShares(
      {
        by_client: [],
        by_model: [
          {
            model_id: "claude-opus-4",
            provider_id: "anthropic",
            total_tokens: 1000,
            cost_usd: 1,
          },
          {
            model_id: "claude-opus-4",
            provider_id: "openai",
            total_tokens: 10,
            cost_usd: 0.01,
          },
          {
            model_id: "gpt-5",
            provider_id: "openai",
            total_tokens: 500,
            cost_usd: 0.5,
          },
        ],
      },
      "tokens",
      "model",
    );

    expect(shares[0]?.id).toBe("claude-opus-4");
    expect(shares[0]?.providerId).toBe("anthropic");
    expect(shares[1]?.id).toBe("gpt-5");
    expect(shares[1]?.providerId).toBe("openai");
  });
});

describe("buildModelProviderMap", () => {
  test("merges overview and daily votes", () => {
    const map = buildModelProviderMap(
      {
        by_model: [
          {
            model_id: "gpt-5",
            provider_id: "openai",
            total_tokens: 100,
          },
        ],
      },
      [
        {
          date: "2026-01-01",
          breakdown: {
            input_tokens: 0,
            output_tokens: 0,
            cache_read_tokens: 0,
            cache_write_tokens: 0,
            reasoning_tokens: 0,
            total_tokens: 50,
          },
          total_tokens: 50,
          total_cost_usd: null,
          message_count: 1,
          by_client: [
            {
              client_id: "claude",
              model_id: "claude-sonnet-4",
              provider_id: "anthropic",
              breakdown: {
                input_tokens: 0,
                output_tokens: 0,
                cache_read_tokens: 0,
                cache_write_tokens: 0,
                reasoning_tokens: 0,
                total_tokens: 50,
              },
              total_tokens: 50,
              cost_usd: null,
              message_count: 1,
            },
          ],
        },
      ],
    );

    expect(map.get("gpt-5")).toBe("openai");
    expect(map.get("claude-sonnet-4")).toBe("anthropic");
  });
});

describe("token usage compact number formatting", () => {
  test("always keeps one fraction digit for tokens and cost", () => {
    expect(formatCompactNumber(42, "en")).toBe("42.0");
    expect(formatCompactNumber(11_000, "en")).toBe("11.0K");
    expect(formatCompactNumber(11_500, "en")).toBe("11.5K");
    expect(formatCurrencyCompact(0.42, "en")).toBe("$0.4");
    expect(formatCurrencyCompact(12, "en")).toBe("$12.0");
    expect(formatCurrencyCompact(11_200, "en")).toBe("$11.2K");
  });
});
