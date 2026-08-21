import type {
  ClientTokenUsageResponse,
  DailyClientTokenUsageResponse,
  DailyTokenUsageResponse,
  ModelTokenUsageResponse,
  MonthlyTokenUsageResponse,
  TokenBreakdownResponse,
  TokenUsageOverviewResponse,
} from "@/api/ws/token-usage-api";
import {
  clientDailySeries,
  clusterCloudAccountIndices,
  isCloudApiClient,
} from "@/features/token-usage/lib/cloud-api-clients";

function addBreakdown(
  into: TokenBreakdownResponse,
  add: TokenBreakdownResponse,
): TokenBreakdownResponse {
  return {
    input_tokens: into.input_tokens + add.input_tokens,
    output_tokens: into.output_tokens + add.output_tokens,
    cache_read_tokens: into.cache_read_tokens + add.cache_read_tokens,
    cache_write_tokens: into.cache_write_tokens + add.cache_write_tokens,
    reasoning_tokens: into.reasoning_tokens + add.reasoning_tokens,
    total_tokens: into.total_tokens + add.total_tokens,
  };
}

function addNullableCost(a: number | null, b: number | null): number | null {
  if (a == null || b == null) return null;
  return a + b;
}

function minDate(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return a < b ? a : b;
}

function maxDate(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
}

function clientTotal(overview: TokenUsageOverviewResponse, clientId: string): number {
  return overview.by_client
    .filter((row) => row.client_id === clientId)
    .reduce((sum, row) => sum + row.total_tokens, 0);
}

function cloudWinnerIndices(
  overviews: TokenUsageOverviewResponse[],
): (clientId: string, overviewIndex: number) => boolean {
  const winners = new Map<string, Set<number>>();
  const clientIds = new Set<string>();
  for (const overview of overviews) {
    for (const row of overview.by_client) {
      if (isCloudApiClient(row.client_id)) clientIds.add(row.client_id);
    }
  }
  for (const clientId of clientIds) {
    const seriesList = overviews.map((overview) =>
      clientDailySeries(overview.by_day, clientId),
    );
    const allowed = new Set<number>();
    for (const cluster of clusterCloudAccountIndices(seriesList)) {
      let winner = cluster[0]!;
      for (const index of cluster) {
        if (clientTotal(overviews[index]!, clientId) > clientTotal(overviews[winner]!, clientId)) {
          winner = index;
        }
      }
      allowed.add(winner);
    }
    winners.set(clientId, allowed);
  }
  return (clientId, overviewIndex) => {
    if (!isCloudApiClient(clientId)) return true;
    return winners.get(clientId)?.has(overviewIndex) ?? false;
  };
}

function totalsFromClientDays(
  rows: DailyClientTokenUsageResponse[],
): Pick<
  DailyTokenUsageResponse,
  "breakdown" | "total_tokens" | "total_cost_usd" | "message_count"
> {
  let breakdown: TokenBreakdownResponse = {
    input_tokens: 0,
    output_tokens: 0,
    cache_read_tokens: 0,
    cache_write_tokens: 0,
    reasoning_tokens: 0,
    total_tokens: 0,
  };
  let totalTokens = 0;
  let messages = 0;
  let cost: number | null = 0;
  for (const row of rows) {
    breakdown = addBreakdown(breakdown, row.breakdown);
    totalTokens += row.total_tokens;
    messages += row.message_count;
    cost = addNullableCost(cost, row.cost_usd);
  }
  return {
    breakdown,
    total_tokens: totalTokens,
    total_cost_usd: cost,
    message_count: messages,
  };
}

export function mergeTokenUsageOverviews(
  overviews: TokenUsageOverviewResponse[],
  missedLabels: string[] = [],
): TokenUsageOverviewResponse {
  if (overviews.length === 0) {
    throw new Error("Cannot merge zero token usage overviews");
  }

  const include = cloudWinnerIndices(overviews);

  const byModel = new Map<string, ModelTokenUsageResponse>();
  overviews.forEach((overview, overviewIndex) => {
    for (const row of overview.by_model) {
      if (!include(row.client_id, overviewIndex)) continue;
      const key = `${row.client_id}\0${row.provider_id}\0${row.model_id}`;
      const prev = byModel.get(key);
      if (!prev) {
        byModel.set(key, { ...row });
        continue;
      }
      byModel.set(key, {
        ...prev,
        input_tokens: prev.input_tokens + row.input_tokens,
        output_tokens: prev.output_tokens + row.output_tokens,
        cache_read_tokens: prev.cache_read_tokens + row.cache_read_tokens,
        cache_write_tokens: prev.cache_write_tokens + row.cache_write_tokens,
        reasoning_tokens: prev.reasoning_tokens + row.reasoning_tokens,
        total_tokens: prev.total_tokens + row.total_tokens,
        cost_usd: addNullableCost(prev.cost_usd, row.cost_usd),
        message_count: prev.message_count + row.message_count,
      });
    }
  });

  const modelsByClient = new Map<string, Set<string>>();
  for (const row of byModel.values()) {
    const models = modelsByClient.get(row.client_id) ?? new Set<string>();
    models.add(row.model_id);
    modelsByClient.set(row.client_id, models);
  }

  const byClient = new Map<string, ClientTokenUsageResponse>();
  overviews.forEach((overview, overviewIndex) => {
    for (const row of overview.by_client) {
      if (!include(row.client_id, overviewIndex)) continue;
      const prev = byClient.get(row.client_id);
      if (!prev) {
        byClient.set(row.client_id, {
          ...row,
          model_count: modelsByClient.get(row.client_id)?.size ?? row.model_count,
        });
        continue;
      }
      byClient.set(row.client_id, {
        ...prev,
        total_tokens: prev.total_tokens + row.total_tokens,
        total_cost_usd: addNullableCost(prev.total_cost_usd, row.total_cost_usd),
        message_count: prev.message_count + row.message_count,
        model_count: modelsByClient.get(row.client_id)?.size ?? prev.model_count,
      });
    }
  });

  const byDay = new Map<string, DailyTokenUsageResponse>();
  const unattributed = new Map<
    string,
    Pick<DailyTokenUsageResponse, "breakdown" | "total_tokens" | "total_cost_usd" | "message_count">
  >();
  overviews.forEach((overview, overviewIndex) => {
    for (const day of overview.by_day) {
      const prev = byDay.get(day.date);
      const byClientDay = new Map<string, DailyClientTokenUsageResponse>();
      const seed = prev?.by_client ?? [];
      for (const row of seed) {
        byClientDay.set(`${row.client_id}\0${row.provider_id}\0${row.model_id}`, {
          ...row,
          breakdown: { ...row.breakdown },
        });
      }
      for (const row of day.by_client) {
        if (!include(row.client_id, overviewIndex)) continue;
        const key = `${row.client_id}\0${row.provider_id}\0${row.model_id}`;
        const existing = byClientDay.get(key);
        if (!existing) {
          byClientDay.set(key, {
            ...row,
            breakdown: { ...row.breakdown },
          });
          continue;
        }
        byClientDay.set(key, {
          ...existing,
          breakdown: addBreakdown(existing.breakdown, row.breakdown),
          total_tokens: existing.total_tokens + row.total_tokens,
          cost_usd: addNullableCost(existing.cost_usd, row.cost_usd),
          message_count: existing.message_count + row.message_count,
        });
      }
      if (day.by_client.length === 0) {
        const prevGap = unattributed.get(day.date);
        unattributed.set(
          day.date,
          prevGap
            ? {
                breakdown: addBreakdown(prevGap.breakdown, day.breakdown),
                total_tokens: prevGap.total_tokens + day.total_tokens,
                total_cost_usd: addNullableCost(prevGap.total_cost_usd, day.total_cost_usd),
                message_count: prevGap.message_count + day.message_count,
              }
            : {
                breakdown: { ...day.breakdown },
                total_tokens: day.total_tokens,
                total_cost_usd: day.total_cost_usd,
                message_count: day.message_count,
              },
        );
      }
      const rows = [...byClientDay.values()];
      const fromRows = totalsFromClientDays(rows);
      const gap = unattributed.get(day.date);
      byDay.set(day.date, {
        date: day.date,
        by_client: rows,
        breakdown: gap ? addBreakdown(fromRows.breakdown, gap.breakdown) : fromRows.breakdown,
        total_tokens: fromRows.total_tokens + (gap?.total_tokens ?? 0),
        total_cost_usd: gap
          ? addNullableCost(fromRows.total_cost_usd, gap.total_cost_usd)
          : fromRows.total_cost_usd,
        message_count: fromRows.message_count + (gap?.message_count ?? 0),
      });
    }
  });

  const sortedDays = [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date));
  const byMonth = new Map<string, MonthlyTokenUsageResponse>();
  for (const day of sortedDays) {
    const month = day.date.slice(0, 7);
    if (month.length < 7) continue;
    const prev = byMonth.get(month);
    const models = new Set(prev?.models ?? []);
    for (const row of day.by_client) {
      if (row.model_id) models.add(row.model_id);
    }
    if (!prev) {
      byMonth.set(month, {
        month,
        breakdown: { ...day.breakdown },
        total_tokens: day.total_tokens,
        total_cost_usd: day.total_cost_usd,
        message_count: day.message_count,
        models: [...models],
      });
      continue;
    }
    byMonth.set(month, {
      month,
      breakdown: addBreakdown(prev.breakdown, day.breakdown),
      total_tokens: prev.total_tokens + day.total_tokens,
      total_cost_usd: addNullableCost(prev.total_cost_usd, day.total_cost_usd),
      message_count: prev.message_count + day.message_count,
      models: [...models],
    });
  }

  let processingTime = 0;
  let generatedAt = 0;
  const warnings = new Set<string>();
  for (const overview of overviews) {
    processingTime = Math.max(processingTime, overview.summary.processing_time_ms);
    generatedAt = Math.max(generatedAt, overview.generated_at);
    for (const warning of overview.partial_warnings) warnings.add(warning);
  }
  for (const label of missedLabels) {
    if (label.trim()) warnings.add(label);
  }

  const first = overviews[0]!;
  let totalTokens = 0;
  let totalMessages = 0;
  let totalCost: number | null = 0;
  let rangeStart: string | null = null;
  let rangeEnd: string | null = null;
  const years = new Set<string>();
  for (const day of sortedDays) {
    totalTokens += day.total_tokens;
    totalMessages += day.message_count;
    totalCost = addNullableCost(totalCost, day.total_cost_usd);
    rangeStart = minDate(rangeStart, day.date);
    rangeEnd = maxDate(rangeEnd, day.date);
    if (day.date.length >= 4) years.add(day.date.slice(0, 4));
  }

  return {
    query: {
      ...first.query,
      year: null,
      since: null,
      until: null,
      clients: null,
    },
    summary: {
      total_tokens: totalTokens,
      total_cost_usd: totalCost,
      total_messages: totalMessages,
      active_days: sortedDays.length,
      range_start: rangeStart,
      range_end: rangeEnd,
      processing_time_ms: processingTime,
    },
    by_client: [...byClient.values()],
    by_model: [...byModel.values()],
    by_day: sortedDays,
    by_month: [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month)),
    available_years: [...years].sort(),
    generated_at: generatedAt,
    partial_warnings: [...warnings],
    browser_cookie_access: undefined,
    computer_count: overviews.length,
  };
}
