/**
 * APP-061 — map local Token Usage overview → slim public snapshot.
 */
import type { TokenUsageOverviewResponse } from "@/api/ws/token-usage-api";

export const SHARE_TOP_N = 5;

export type TokenUsageShareMix = {
  input: number;
  output: number;
  cache_read: number;
  cache_write: number;
  reasoning: number;
};

export type TokenUsageShareRankRow = {
  id: string;
  total_tokens: number;
  message_count: number;
  provider_id?: string;
  total_cost_usd?: number;
};

export type TokenUsageShareDimRow = {
  id: string;
  total_tokens: number;
  cost_usd?: number;
};

export type TokenUsageShareDay = {
  date: string;
  total_tokens: number;
  message_count: number;
  total_cost_usd?: number;
  breakdown: TokenUsageShareMix;
  agents: TokenUsageShareDimRow[];
  models: TokenUsageShareDimRow[];
};

export type TokenUsageSharePayload = {
  schema_version: 2;
  generated_at: number;
  summary: {
    total_tokens: number;
    total_messages: number;
    active_days: number;
    range_start: string | null;
    range_end: string | null;
    client_count: number;
    model_count: number;
    total_cost_usd?: number;
    mix: TokenUsageShareMix;
  };
  by_client: TokenUsageShareRankRow[];
  by_model: TokenUsageShareRankRow[];
  by_day: TokenUsageShareDay[];
};

function topKeys(
  totals: Map<string, number>,
  extra: Iterable<string> = [],
): Set<string> {
  const ranked = [...totals.entries()]
    .filter(([id]) => id !== "other")
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => id);
  const keys = new Set(ranked.slice(0, SHARE_TOP_N));
  for (const id of extra) {
    if (id && id !== "other") keys.add(id);
  }
  return keys;
}

function collapseDims(
  rows: Array<{ id: string; total_tokens: number; cost_usd?: number }>,
  keep: Set<string>,
  includeCost: boolean,
): TokenUsageShareDimRow[] {
  const kept = new Map<string, TokenUsageShareDimRow>();
  let otherTokens = 0;
  let otherCost = 0;
  for (const row of rows) {
    if (keep.has(row.id)) {
      const prev = kept.get(row.id);
      kept.set(row.id, {
        id: row.id,
        total_tokens: (prev?.total_tokens ?? 0) + row.total_tokens,
        ...(includeCost
          ? { cost_usd: (prev?.cost_usd ?? 0) + (row.cost_usd ?? 0) }
          : {}),
      });
    } else {
      otherTokens += row.total_tokens;
      otherCost += row.cost_usd ?? 0;
    }
  }
  const out = [...kept.values()].sort((a, b) => b.total_tokens - a.total_tokens);
  if (otherTokens > 0 || (includeCost && otherCost > 0)) {
    out.push({
      id: "other",
      total_tokens: otherTokens,
      ...(includeCost ? { cost_usd: otherCost } : {}),
    });
  }
  return out;
}

export function mapOverviewToSharePayload(
  overview: TokenUsageOverviewResponse,
  opts: { includeCost: boolean },
): TokenUsageSharePayload {
  const includeCost = opts.includeCost;
  const clientTotals = new Map<string, number>();
  const clientCost = new Map<string, number>();
  const clientMessages = new Map<string, number>();
  for (const row of overview.by_client ?? []) {
    clientTotals.set(row.client_id, row.total_tokens);
    clientMessages.set(row.client_id, row.message_count);
    if (includeCost) {
      clientCost.set(row.client_id, row.total_cost_usd ?? 0);
    }
  }

  const modelTotals = new Map<string, number>();
  const modelCost = new Map<string, number>();
  const modelMessages = new Map<string, number>();
  const modelProvider = new Map<string, { provider: string; weight: number }>();
  const modelIds = new Set<string>();
  for (const row of overview.by_model ?? []) {
    const id = row.model_id.trim() || "unknown";
    modelIds.add(id);
    modelTotals.set(id, (modelTotals.get(id) ?? 0) + row.total_tokens);
    modelMessages.set(id, (modelMessages.get(id) ?? 0) + row.message_count);
    if (includeCost) {
      modelCost.set(id, (modelCost.get(id) ?? 0) + (row.cost_usd ?? 0));
    }
    const prev = modelProvider.get(id);
    const weight = row.total_tokens;
    if (!prev || weight > prev.weight) {
      modelProvider.set(id, { provider: row.provider_id, weight });
    }
  }

  const clientCostKeys = includeCost
    ? [...clientCost.entries()]
        .filter(([id]) => id !== "other")
        .sort((a, b) => b[1] - a[1])
        .slice(0, SHARE_TOP_N)
        .map(([id]) => id)
    : [];
  const modelCostKeys = includeCost
    ? [...modelCost.entries()]
        .filter(([id]) => id !== "other")
        .sort((a, b) => b[1] - a[1])
        .slice(0, SHARE_TOP_N)
        .map(([id]) => id)
    : [];

  const agentKeys = topKeys(clientTotals, clientCostKeys);
  const modelKeys = topKeys(modelTotals, modelCostKeys);

  const by_client: TokenUsageShareRankRow[] = [...agentKeys]
    .map((id) => ({
      id,
      total_tokens: clientTotals.get(id) ?? 0,
      message_count: clientMessages.get(id) ?? 0,
      ...(includeCost ? { total_cost_usd: clientCost.get(id) ?? 0 } : {}),
    }))
    .sort((a, b) => b.total_tokens - a.total_tokens)
    .slice(0, SHARE_TOP_N);

  const by_model: TokenUsageShareRankRow[] = [...modelKeys]
    .map((id) => ({
      id,
      total_tokens: modelTotals.get(id) ?? 0,
      message_count: modelMessages.get(id) ?? 0,
      provider_id: modelProvider.get(id)?.provider,
      ...(includeCost ? { total_cost_usd: modelCost.get(id) ?? 0 } : {}),
    }))
    .sort((a, b) => b.total_tokens - a.total_tokens)
    .slice(0, SHARE_TOP_N);

  let mix: TokenUsageShareMix = {
    input: 0,
    output: 0,
    cache_read: 0,
    cache_write: 0,
    reasoning: 0,
  };

  const by_day: TokenUsageShareDay[] = (overview.by_day ?? []).map((day) => {
    mix = {
      input: mix.input + day.breakdown.input_tokens,
      output: mix.output + day.breakdown.output_tokens,
      cache_read: mix.cache_read + day.breakdown.cache_read_tokens,
      cache_write: mix.cache_write + day.breakdown.cache_write_tokens,
      reasoning: mix.reasoning + day.breakdown.reasoning_tokens,
    };
    const agentRows = (day.by_client ?? []).map((row) => ({
      id: row.client_id,
      total_tokens: row.total_tokens,
      ...(includeCost ? { cost_usd: row.cost_usd ?? 0 } : {}),
    }));
    const modelRows = (day.by_client ?? []).map((row) => ({
      id: row.model_id.trim() || "unknown",
      total_tokens: row.total_tokens,
      ...(includeCost ? { cost_usd: row.cost_usd ?? 0 } : {}),
    }));
    return {
      date: day.date,
      total_tokens: day.total_tokens,
      message_count: day.message_count,
      ...(includeCost ? { total_cost_usd: day.total_cost_usd ?? 0 } : {}),
      breakdown: {
        input: day.breakdown.input_tokens,
        output: day.breakdown.output_tokens,
        cache_read: day.breakdown.cache_read_tokens,
        cache_write: day.breakdown.cache_write_tokens,
        reasoning: day.breakdown.reasoning_tokens,
      },
      agents: collapseDims(agentRows, agentKeys, includeCost),
      models: collapseDims(modelRows, modelKeys, includeCost),
    };
  });

  return {
    schema_version: 2,
    generated_at: overview.generated_at || Date.now(),
    summary: {
      total_tokens: overview.summary.total_tokens,
      total_messages: overview.summary.total_messages,
      active_days: overview.summary.active_days,
      range_start: overview.summary.range_start,
      range_end: overview.summary.range_end,
      client_count: overview.by_client?.length ?? 0,
      model_count: modelIds.size,
      ...(includeCost
        ? { total_cost_usd: overview.summary.total_cost_usd ?? 0 }
        : {}),
      mix,
    },
    by_client,
    by_model,
    by_day,
  };
}

function emptyBreakdown() {
  return {
    input_tokens: 0,
    output_tokens: 0,
    cache_read_tokens: 0,
    cache_write_tokens: 0,
    reasoning_tokens: 0,
    total_tokens: 0,
  };
}

function residualTokens(
  rows: Array<{ total_tokens: number }>,
  total: number,
): number {
  const sum = rows.reduce((acc, row) => acc + row.total_tokens, 0);
  return Math.max(0, total - sum);
}

/** Rebuild an overview-shaped object so the in-app charts can render a payload. */
export function inflateSharePayload(
  payload: TokenUsageSharePayload,
  dimension: "agent" | "model",
): TokenUsageOverviewResponse {
  const years = [
    ...new Set(
      payload.by_day.map((d) => d.date.slice(0, 4)).filter((y) => y.length === 4),
    ),
  ].sort();

  return {
    query: { group_by: "client_provider_model" },
    summary: {
      total_tokens: payload.summary.total_tokens,
      total_cost_usd: payload.summary.total_cost_usd ?? null,
      total_messages: payload.summary.total_messages,
      active_days: payload.summary.active_days,
      range_start: payload.summary.range_start,
      range_end: payload.summary.range_end,
      processing_time_ms: 0,
    },
    by_client: [
      ...payload.by_client.map((row) => ({
        client_id: row.id,
        total_tokens: row.total_tokens,
        total_cost_usd: row.total_cost_usd ?? null,
        message_count: row.message_count,
        model_count: 0,
      })),
      ...(residualTokens(payload.by_client, payload.summary.total_tokens) > 0
        ? [
            {
              client_id: "other",
              total_tokens: residualTokens(
                payload.by_client,
                payload.summary.total_tokens,
              ),
              total_cost_usd: null,
              message_count: 0,
              model_count: 0,
            },
          ]
        : []),
    ],
    by_model: [
      ...payload.by_model.map((row) => ({
        client_id: "",
        provider_id: row.provider_id ?? "",
        model_id: row.id,
        input_tokens: 0,
        output_tokens: 0,
        cache_read_tokens: 0,
        cache_write_tokens: 0,
        reasoning_tokens: 0,
        total_tokens: row.total_tokens,
        cost_usd: row.total_cost_usd ?? null,
        message_count: row.message_count,
      })),
      ...(residualTokens(payload.by_model, payload.summary.total_tokens) > 0
        ? [
            {
              client_id: "",
              provider_id: "",
              model_id: "other",
              input_tokens: 0,
              output_tokens: 0,
              cache_read_tokens: 0,
              cache_write_tokens: 0,
              reasoning_tokens: 0,
              total_tokens: residualTokens(
                payload.by_model,
                payload.summary.total_tokens,
              ),
              cost_usd: null,
              message_count: 0,
            },
          ]
        : []),
    ],
    by_day: payload.by_day.map((day) => {
      const dims = dimension === "model" ? day.models : day.agents;
      return {
        date: day.date,
        breakdown: {
          input_tokens: day.breakdown.input,
          output_tokens: day.breakdown.output,
          cache_read_tokens: day.breakdown.cache_read,
          cache_write_tokens: day.breakdown.cache_write,
          reasoning_tokens: day.breakdown.reasoning,
          total_tokens: day.total_tokens,
        },
        total_tokens: day.total_tokens,
        total_cost_usd: day.total_cost_usd ?? null,
        message_count: day.message_count,
        by_client: dims.map((row) => ({
          client_id: dimension === "agent" ? row.id : "",
          model_id: dimension === "model" ? row.id : "",
          provider_id:
            dimension === "model"
              ? (payload.by_model.find((m) => m.id === row.id)?.provider_id ??
                "")
              : "",
          breakdown: emptyBreakdown(),
          total_tokens: row.total_tokens,
          cost_usd: row.cost_usd ?? null,
          message_count: 0,
        })),
      };
    }),
    by_month: [],
    available_years: years,
    generated_at: payload.generated_at,
    partial_warnings: [],
  };
}

export function isSharePayload(value: unknown): value is TokenUsageSharePayload {
  if (!value || typeof value !== "object") return false;
  const rec = value as { schema_version?: unknown };
  return rec.schema_version === 2;
}
