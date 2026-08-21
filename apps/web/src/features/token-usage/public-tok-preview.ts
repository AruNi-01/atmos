import type { PublicTokData } from "@/features/token-usage/fetch-public-tok";
import type { TokenUsageSharePayload } from "@/features/token-usage/token-usage-share-payload";

/** Dev-only handle: open /tok/@preview without Hub. */
export const PUBLIC_TOK_PREVIEW_HANDLE = "preview";

function dayStamp(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function buildPreviewDays(year: number): TokenUsageSharePayload["by_day"] {
  const days: TokenUsageSharePayload["by_day"] = [];
  for (let month = 1; month <= 8; month++) {
    const dim = new Date(year, month, 0).getDate();
    for (let day = 1; day <= dim; day++) {
      const wave = ((month * 13 + day * 7) % 11) / 11;
      if (wave < 0.18) continue;
      const total = Math.round(80_000 + wave * 420_000);
      const claude = Math.round(total * 0.46);
      const codex = Math.round(total * 0.28);
      const other = total - claude - codex;
      const opus = Math.round(total * 0.4);
      const gpt = Math.round(total * 0.32);
      days.push({
        date: dayStamp(year, month, day),
        total_tokens: total,
        message_count: Math.round(12 + wave * 40),
        total_cost_usd: Number((total / 1_200_000).toFixed(2)),
        breakdown: {
          input: Math.round(total * 0.55),
          output: Math.round(total * 0.22),
          cache_read: Math.round(total * 0.15),
          cache_write: Math.round(total * 0.04),
          reasoning: Math.round(total * 0.04),
        },
        agents: [
          { id: "claude", total_tokens: claude, cost_usd: claude / 1_200_000 },
          { id: "codex", total_tokens: codex, cost_usd: codex / 1_200_000 },
          { id: "other", total_tokens: other, cost_usd: other / 1_200_000 },
        ],
        models: [
          { id: "claude-opus-4", total_tokens: opus, cost_usd: opus / 1_000_000 },
          { id: "gpt-5", total_tokens: gpt, cost_usd: gpt / 1_400_000 },
          {
            id: "other",
            total_tokens: total - opus - gpt,
            cost_usd: (total - opus - gpt) / 1_200_000,
          },
        ],
      });
    }
  }
  return days;
}

export function buildPublicTokPreview(): PublicTokData {
  const year = new Date().getFullYear();
  const by_day = buildPreviewDays(year);
  const total_tokens = by_day.reduce((sum, day) => sum + day.total_tokens, 0);
  const total_messages = by_day.reduce((sum, day) => sum + day.message_count, 0);
  const mix = by_day.reduce(
    (acc, day) => ({
      input: acc.input + day.breakdown.input,
      output: acc.output + day.breakdown.output,
      cache_read: acc.cache_read + day.breakdown.cache_read,
      cache_write: acc.cache_write + day.breakdown.cache_write,
      reasoning: acc.reasoning + day.breakdown.reasoning,
    }),
    { input: 0, output: 0, cache_read: 0, cache_write: 0, reasoning: 0 },
  );

  return {
    handle: PUBLIC_TOK_PREVIEW_HANDLE,
    avatar_url: "https://avatars.githubusercontent.com/u/9919?v=4",
    github_username: "builder",
    x_username: "builder",
    generated_at: Date.now(),
    snapshot: {
      schema_version: 2,
      generated_at: Date.now(),
      summary: {
        total_tokens,
        total_messages,
        active_days: by_day.length,
        range_start: by_day[0]?.date ?? `${year}-01-01`,
        range_end: by_day[by_day.length - 1]?.date ?? `${year}-08-15`,
        client_count: 8,
        model_count: 12,
        total_cost_usd: Number((total_tokens / 1_200_000).toFixed(2)),
        mix,
        computer_count: 3,
      },
      by_client: [
        { id: "claude", total_tokens: Math.round(total_tokens * 0.46), message_count: 420 },
        { id: "codex", total_tokens: Math.round(total_tokens * 0.28), message_count: 210 },
        { id: "cursor", total_tokens: Math.round(total_tokens * 0.12), message_count: 90 },
        { id: "gemini", total_tokens: Math.round(total_tokens * 0.08), message_count: 60 },
        { id: "grok", total_tokens: Math.round(total_tokens * 0.06), message_count: 40 },
      ],
      by_model: [
        {
          id: "claude-opus-4",
          provider_id: "anthropic",
          total_tokens: Math.round(total_tokens * 0.4),
          message_count: 200,
        },
        {
          id: "gpt-5",
          provider_id: "openai",
          total_tokens: Math.round(total_tokens * 0.32),
          message_count: 180,
        },
        {
          id: "gemini-2.5-pro",
          provider_id: "google",
          total_tokens: Math.round(total_tokens * 0.14),
          message_count: 70,
        },
        {
          id: "grok-4",
          provider_id: "xai",
          total_tokens: Math.round(total_tokens * 0.08),
          message_count: 40,
        },
        {
          id: "composer",
          provider_id: "cursor",
          total_tokens: Math.round(total_tokens * 0.06),
          message_count: 30,
        },
      ],
      by_day,
    },
  };
}
