import type { TokenUsageOverviewResponse } from "@atmos/api-types/ws/dto/token-usage";

const TOP = 5;

type Dim = { id: string; total_tokens: number; cost_usd?: number };

export function mapOverviewToSharePayload(overview: TokenUsageOverviewResponse, includeCost: boolean) {
  const clientTotals = new Map<string, number>();
  const clientCost = new Map<string, number>();
  const clientMessages = new Map<string, number>();
  for (const row of overview.by_client ?? []) {
    clientTotals.set(row.client_id, row.total_tokens);
    clientMessages.set(row.client_id, row.message_count);
    if (includeCost) clientCost.set(row.client_id, row.total_cost_usd ?? 0);
  }
  const modelTotals = new Map<string, number>();
  const modelCost = new Map<string, number>();
  const modelMessages = new Map<string, number>();
  const modelProvider = new Map<string, string>();
  const modelIds = new Set<string>();
  for (const row of overview.by_model ?? []) {
    const id = row.model_id.trim() || "unknown";
    modelIds.add(id);
    modelTotals.set(id, (modelTotals.get(id) ?? 0) + row.total_tokens);
    modelMessages.set(id, (modelMessages.get(id) ?? 0) + row.message_count);
    if (includeCost) modelCost.set(id, (modelCost.get(id) ?? 0) + (row.cost_usd ?? 0));
    if (!modelProvider.has(id)) modelProvider.set(id, row.provider_id);
  }
  const top = (totals: Map<string, number>) =>
    [...totals.entries()].filter(([id]) => id !== "other").sort((a, b) => b[1] - a[1]).slice(0, TOP).map(([id]) => id);
  const agentKeys = new Set(top(clientTotals));
  const modelKeys = new Set(top(modelTotals));
  const mix = { input: 0, output: 0, cache_read: 0, cache_write: 0, reasoning: 0 };
  const collapse = (rows: Dim[], keep: Set<string>) => {
    const kept = new Map<string, Dim>();
    let otherTokens = 0;
    let otherCost = 0;
    for (const row of rows) {
      if (keep.has(row.id)) {
        const prev = kept.get(row.id);
        kept.set(row.id, {
          id: row.id,
          total_tokens: (prev?.total_tokens ?? 0) + row.total_tokens,
          ...(includeCost ? { cost_usd: (prev?.cost_usd ?? 0) + (row.cost_usd ?? 0) } : {}),
        });
      } else {
        otherTokens += row.total_tokens;
        otherCost += row.cost_usd ?? 0;
      }
    }
    const out = [...kept.values()];
    if (otherTokens > 0) out.push({ id: "other", total_tokens: otherTokens, ...(includeCost ? { cost_usd: otherCost } : {}) });
    return out;
  };
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
      ...(includeCost ? { total_cost_usd: overview.summary.total_cost_usd ?? 0 } : {}),
      mix,
    },
    by_client: [...agentKeys].map((id) => ({
      id,
      total_tokens: clientTotals.get(id) ?? 0,
      message_count: clientMessages.get(id) ?? 0,
      ...(includeCost ? { total_cost_usd: clientCost.get(id) ?? 0 } : {}),
    })),
    by_model: [...modelKeys].map((id) => ({
      id,
      total_tokens: modelTotals.get(id) ?? 0,
      message_count: modelMessages.get(id) ?? 0,
      provider_id: modelProvider.get(id),
      ...(includeCost ? { total_cost_usd: modelCost.get(id) ?? 0 } : {}),
    })),
    by_day: (overview.by_day ?? []).map((day) => {
      mix.input += day.breakdown.input_tokens;
      mix.output += day.breakdown.output_tokens;
      mix.cache_read += day.breakdown.cache_read_tokens;
      mix.cache_write += day.breakdown.cache_write_tokens;
      mix.reasoning += day.breakdown.reasoning_tokens;
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
        agents: collapse(
          (day.by_client ?? []).map((row) => ({
            id: row.client_id,
            total_tokens: row.total_tokens,
            ...(includeCost ? { cost_usd: row.cost_usd ?? 0 } : {}),
          })),
          agentKeys,
        ),
        models: collapse(
          (day.by_client ?? []).map((row) => ({
            id: row.model_id.trim() || "unknown",
            total_tokens: row.total_tokens,
            ...(includeCost ? { cost_usd: row.cost_usd ?? 0 } : {}),
          })),
          modelKeys,
        ),
      };
    }),
  };
}
