import {
  addDays,
  addMonths,
  endOfWeek,
  endOfYear,
  eachDayOfInterval,
  format,
  parseISO,
  startOfWeek,
  startOfYear,
} from "date-fns";

import type { DailyTokenUsageResponse } from "@/api/ws/token-usage-api";
import type { ChartConfig } from "@/shared/components/ui/chart";

export type Resolution = "month" | "day";

/** Primary chart metric — tokens stay default; cost uses tokscale USD fields. */
export type UsageMetric = "tokens" | "cost";

/** Breakdown dimension for share bars + stacked series. */
export type UsageDimension = "agent" | "model";

export type HeatmapCell = {
  date: string;
  count: number | null;
  level: 0 | 1 | 2 | 3 | 4;
  detail: DailyTokenUsageResponse | null;
};

export type HeatmapWeek = {
  cells: HeatmapCell[];
};

export type HeatmapMonthLabel = {
  label: string;
  offset: number;
};

export type HeatmapHoverState = {
  cell: HeatmapCell;
  weekIndex: number;
  dayIndex: number;
  anchorRect: {
    left: number;
    top: number;
    width: number;
    height: number;
  };
};

export type TimelinePoint = {
  key: string;
  label: string;
  tokens: number;
  cost: number;
  messages: number;
  input: number;
  output: number;
  cache: number;
  reasoning: number;
};

export type AgentSeries = {
  data: Array<Record<string, string | number>>;
  keys: string[];
};

export type YearBreakdownSummary = {
  totalTokens: number;
  totalCost: number;
  totalMessages: number;
  activeDays: number;
  input: number;
  output: number;
  cache: number;
  reasoning: number;
};

export type BreakdownShare = {
  /** Agent client_id or model_id (or "other"). */
  id: string;
  label: string;
  /** Metric amount (tokens or cost USD depending on UsageMetric). */
  value: number;
  share: number;
  sharePercent: number;
};

/** @deprecated Prefer BreakdownShare — kept for call sites still using the name. */
export type YearAgentShare = BreakdownShare & {
  /** Alias of `id` for agent rows. */
  clientId: string;
};

/** Day-level metric amount from tokscale overview rows. */
export function dayMetricValue(
  day: DailyTokenUsageResponse,
  metric: UsageMetric,
): number {
  if (metric === "cost") {
    return day.total_cost_usd ?? 0;
  }
  return day.total_tokens;
}

/** Per-client day row metric (client.cost_usd vs total_tokens). */
export function clientDayMetricValue(
  client: { total_tokens: number; cost_usd: number | null },
  metric: UsageMetric,
): number {
  if (metric === "cost") {
    return client.cost_usd ?? 0;
  }
  return client.total_tokens;
}

/** Overview client row metric. */
export function clientOverviewMetricValue(
  client: { total_tokens: number; total_cost_usd: number | null },
  metric: UsageMetric,
): number {
  if (metric === "cost") {
    return client.total_cost_usd ?? 0;
  }
  return client.total_tokens;
}

/** Overview model row metric (`cost_usd` vs `total_tokens`). */
export function modelOverviewMetricValue(
  model: { total_tokens: number; cost_usd: number | null },
  metric: UsageMetric,
): number {
  if (metric === "cost") {
    return model.cost_usd ?? 0;
  }
  return model.total_tokens;
}

/** Stable series key for a daily client/model contribution row. */
export function dimensionKeyOf(
  row: { client_id: string; model_id: string },
  dimension: UsageDimension,
): string {
  if (dimension === "model") {
    const modelId = row.model_id.trim();
    return modelId || "unknown";
  }
  return row.client_id;
}

/** Display label for model ids — keep recognizable model slugs. */
export function formatModelLabel(modelId: string): string {
  const raw = modelId.trim();
  if (!raw || raw === "unknown" || raw === "other") {
    return raw || "unknown";
  }
  const leaf = raw.includes("/") ? raw.slice(raw.lastIndexOf("/") + 1) : raw;
  return leaf || raw;
}

export function formatDimensionLabel(
  id: string,
  dimension: UsageDimension,
  otherLabel: string,
): string {
  if (id === "other") return otherLabel;
  if (dimension === "model") return formatModelLabel(id);
  return humanizeId(id);
}

/**
 * High-separation hues for stacked agent charts (avoid near-neighbours like
 * sky+blue or violet+purple sitting next to each other in assignment order).
 */
export const AGENT_CHART_COLORS_DARK = [
  "#38BDF8", // sky
  "#F97316", // orange (claude-ish)
  "#A78BFA", // violet
  "#4ADE80", // green
  "#F472B6", // pink
  "#FBBF24", // amber
  "#2DD4BF", // teal
  "#F87171", // red
  "#C084FC", // purple
  "#EAB308", // yellow
  "#22D3EE", // cyan
  "#FB7185", // rose
] as const;

export const AGENT_CHART_COLORS_LIGHT = [
  "#0284C7",
  "#EA580C",
  "#7C3AED",
  "#16A34A",
  "#DB2777",
  "#D97706",
  "#0D9488",
  "#DC2626",
  "#9333EA",
  "#CA8A04",
  "#0891B2",
  "#E11D48",
] as const;

const AGENT_OTHER_COLOR_DARK = "#64748B";
const AGENT_OTHER_COLOR_LIGHT = "#94A3B8";

/**
 * Preferred brand-aligned slots for well-known tokscale client ids.
 * Indices into AGENT_CHART_COLORS_*; remaining agents fill unused slots in order.
 */
const PREFERRED_AGENT_COLOR_INDEX: Record<string, number> = {
  // Keep primary brands on unique slots so common top-5 sets never collide.
  codex: 0,
  claude: 1,
  cursor: 2,
  opencode: 3,
  droid: 4,
  "factory-droid": 4,
  gemini: 5,
  copilot: 6,
  "github-copilot": 6,
  pi: 7,
  amp: 8,
  hermes: 9,
  openclaw: 10,
  kimi: 11,
  // Secondary aliases share a brand slot only when they are the same product line.
  "qwen-code": 5,
  qwen: 5,
  kilocode: 8,
  kilo: 8,
  "kiro-cli": 9,
  kiro: 9,
  roocode: 3,
  roo: 3,
  cline: 7,
  goose: 11,
  antigravity: 2,
  "antigravity-cli": 2,
  junie: 10,
  trae: 1,
  "grok-build": 0,
  grok: 0,
  "command-code": 6,
  commandcode: 6,
  mux: 4,
  crush: 8,
  zed: 9,
  warp: 10,
  auggie: 11,
  augment: 11,
  "codebuddy-code": 1,
  codebuddy: 1,
  workbuddy: 3,
  devin: 7,
  "devin-cli": 7,
  "devin-desktop": 7,
};

/**
 * Assign unique colors across a set of agent ids for one page of charts.
 * Preferred brands get fixed slots; others take the first free palette color
 * so two agents never share a hue in the same ranking list.
 */
export function assignAgentChartColors(
  clientIds: readonly string[],
  theme: "dark" | "light" = "dark",
): Map<string, string> {
  const palette =
    theme === "dark" ? AGENT_CHART_COLORS_DARK : AGENT_CHART_COLORS_LIGHT;
  const other = theme === "dark" ? AGENT_OTHER_COLOR_DARK : AGENT_OTHER_COLOR_LIGHT;
  const map = new Map<string, string>();
  const usedIndexes = new Set<number>();

  for (const raw of clientIds) {
    const id = raw.trim().toLowerCase();
    if (!id || id === "other") {
      map.set(raw, other);
      continue;
    }
    const preferred = PREFERRED_AGENT_COLOR_INDEX[id];
    if (preferred !== undefined && !usedIndexes.has(preferred)) {
      map.set(raw, palette[preferred % palette.length]!);
      usedIndexes.add(preferred % palette.length);
    }
  }

  let next = 0;
  for (const raw of clientIds) {
    if (map.has(raw)) continue;
    while (usedIndexes.has(next % palette.length) && next < palette.length * 2) {
      next += 1;
    }
    const idx = next % palette.length;
    map.set(raw, palette[idx]!);
    usedIndexes.add(idx);
    next += 1;
  }

  return map;
}

/** Color for one agent given a pre-built assignment (or fallback alone). */
export function agentChartColor(
  clientId: string,
  theme: "dark" | "light" = "dark",
  assignment?: ReadonlyMap<string, string>,
): string {
  if (assignment?.has(clientId)) {
    return assignment.get(clientId)!;
  }
  return assignAgentChartColors([clientId], theme).get(clientId)!;
}

/** Colors for a segment list in order (e.g. agentSeries.keys) — unique within list. */
export function agentChartColors(
  clientIds: readonly string[],
  theme: "dark" | "light" = "dark",
): string[] {
  const assignment = assignAgentChartColors(clientIds, theme);
  return clientIds.map((id) => assignment.get(id)!);
}

/** All-time (or filtered day set) token composition — cache read/write kept separate. */
export type TokenMixSummary = {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  reasoning: number;
  total: number;
};

export type TokenMixSlice = {
  id: keyof Omit<TokenMixSummary, "total">;
  value: number;
  share: number;
  sharePercent: number;
};

/** Aggregate input/output/cache/reasoning from daily breakdown rows (no extra fetch). */
export function summarizeTokenMix(days: DailyTokenUsageResponse[]): TokenMixSummary {
  const summary: TokenMixSummary = {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    reasoning: 0,
    total: 0,
  };

  for (const day of days) {
    summary.input += day.breakdown.input_tokens;
    summary.output += day.breakdown.output_tokens;
    summary.cacheRead += day.breakdown.cache_read_tokens;
    summary.cacheWrite += day.breakdown.cache_write_tokens;
    summary.reasoning += day.breakdown.reasoning_tokens;
  }

  summary.total =
    summary.input +
    summary.output +
    summary.cacheRead +
    summary.cacheWrite +
    summary.reasoning;

  return summary;
}

export function tokenMixSlices(mix: TokenMixSummary): TokenMixSlice[] {
  const total = mix.total > 0 ? mix.total : 1;
  const entries: Array<[TokenMixSlice["id"], number]> = [
    ["input", mix.input],
    ["output", mix.output],
    ["cacheRead", mix.cacheRead],
    ["cacheWrite", mix.cacheWrite],
    ["reasoning", mix.reasoning],
  ];
  return entries.map(([id, value]) => ({
    id,
    value,
    share: value / total,
    sharePercent: (value / total) * 100,
  }));
}

export type CurveChartLabelConfig = {
  tokens: string;
  messages: string;
};

export type TokenMixChartLabelConfig = {
  input: string;
  output: string;
  cache: string;
  reasoning: string;
};

export type HeatmapAgentRadarChartLabelConfig = {
  share: string;
};

export type HeatmapDayLabelConfig = {
  mon: string;
  wed: string;
  fri: string;
};

export function buildCurveChartConfig(labels: CurveChartLabelConfig) {
  return {
    tokens: {
      label: labels.tokens,
      color: "var(--color-chart-1)",
    },
    messages: {
      label: labels.messages,
      color: "var(--color-chart-3)",
    },
  } satisfies ChartConfig;
}

export function buildTokenMixChartConfig(labels: TokenMixChartLabelConfig) {
  return {
    input: {
      label: labels.input,
      color: "var(--color-chart-1)",
    },
    output: {
      label: labels.output,
      color: "var(--color-chart-2)",
    },
    cache: {
      label: labels.cache,
      color: "var(--color-chart-3)",
    },
    reasoning: {
      label: labels.reasoning,
      color: "var(--color-chart-4)",
    },
  } satisfies ChartConfig;
}

export function buildHeatmapAgentRadarChartConfig(labels: HeatmapAgentRadarChartLabelConfig) {
  return {
    share: {
      label: labels.share,
      color: "var(--color-chart-2)",
    },
  } satisfies ChartConfig;
}

export function buildHeatmapDayLabels(labels: HeatmapDayLabelConfig) {
  return [
    { label: labels.mon, row: 1 },
    { label: labels.wed, row: 3 },
    { label: labels.fri, row: 5 },
  ] as const;
}

export const HEATMAP_CELL_SIZE = 12;
export const HEATMAP_GAP = 5;
export const HEATMAP_DAY_LABEL_WIDTH = 52;
export const HEATMAP_COLUMN_GAP = 16;
export const HEATMAP_HEADER_HEIGHT = 28;
export const HEATMAP_POPOVER_WIDTH = 244;
export const HEATMAP_POPOVER_OFFSET = 64;
export const HEATMAP_POPOVER_HEIGHT = 184;

export const agentPalette = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "color-mix(in oklch, var(--color-chart-1) 62%, var(--color-chart-2))",
  "color-mix(in oklch, var(--color-chart-2) 58%, var(--color-chart-3))",
];

export const darkHeatmapPalette = [
  "#2f2f35",
  "#13362a",
  "#165742",
  "#11825f",
  "#12b886",
] as const;

export const lightHeatmapPalette = [
  "#ececf1",
  "#d0ece6",
  "#9edacd",
  "#5fc1ae",
  "#20a689",
] as const;

export function buildTimelineSeries(
  days: DailyTokenUsageResponse[],
  resolution: Resolution,
  locale: string,
): TimelinePoint[] {
  const emptyPoint = (key: string): TimelinePoint => ({
    key,
    label: formatPeriodLabel(key, resolution, locale),
    tokens: 0,
    cost: 0,
    messages: 0,
    input: 0,
    output: 0,
    cache: 0,
    reasoning: 0,
  });

  const buckets = new Map<string, TimelinePoint>(
    periodKeysForRange(days, resolution).map((key) => [key, emptyPoint(key)]),
  );

  for (const day of days) {
    const key = resolution === "day" ? day.date : day.date.slice(0, 7);
    const existing = buckets.get(key) ?? emptyPoint(key);

    existing.tokens += day.total_tokens;
    existing.cost += day.total_cost_usd ?? 0;
    existing.messages += day.message_count;
    existing.input += day.breakdown.input_tokens;
    existing.output += day.breakdown.output_tokens;
    existing.cache += day.breakdown.cache_read_tokens + day.breakdown.cache_write_tokens;
    existing.reasoning += day.breakdown.reasoning_tokens;

    buckets.set(key, existing);
  }

  return Array.from(buckets.values()).sort((left, right) => left.key.localeCompare(right.key));
}

/**
 * Stacked series for agent or model dimension (top 5 + other).
 * Daily rows already carry both `client_id` and `model_id`.
 */
export function buildBreakdownSeries(
  days: DailyTokenUsageResponse[],
  resolution: Resolution,
  locale: string,
  metric: UsageMetric = "tokens",
  dimension: UsageDimension = "agent",
): AgentSeries {
  const totals = new Map<string, number>();
  const periods = new Map<string, Record<string, number>>(
    periodKeysForRange(days, resolution).map((key) => [key, {}]),
  );

  for (const day of days) {
    const periodKey = resolution === "day" ? day.date : day.date.slice(0, 7);
    const bucket = periods.get(periodKey) ?? {};

    for (const client of day.by_client) {
      const seriesKey = dimensionKeyOf(client, dimension);
      const amount = clientDayMetricValue(client, metric);
      bucket[seriesKey] = (bucket[seriesKey] ?? 0) + amount;
      totals.set(seriesKey, (totals.get(seriesKey) ?? 0) + amount);
    }

    periods.set(periodKey, bucket);
  }

  const ranked = Array.from(totals.entries())
    .sort((left, right) => right[1] - left[1])
    .map(([id]) => id);

  const top = ranked.slice(0, 5);
  const topSet = new Set(top);
  const hasOther = ranked.length > top.length;
  const keys = hasOther ? [...top, "other"] : top;

  const data = Array.from(periods.entries())
    .sort((left, right) => left[0].localeCompare(right[0]))
    .map(([periodKey, bucket]) => {
      const point: Record<string, string | number> = {
        label: formatPeriodLabel(periodKey, resolution, locale),
      };

      let other = 0;
      for (const [id, value] of Object.entries(bucket)) {
        if (topSet.has(id)) {
          point[id] = value;
        } else {
          other += value;
        }
      }

      for (const id of top) {
        if (!(id in point)) {
          point[id] = 0;
        }
      }

      if (hasOther) {
        point.other = other;
      }

      return point;
    });

  return { data, keys };
}

/** @deprecated Prefer buildBreakdownSeries(..., "agent"). */
export function buildAgentSeries(
  days: DailyTokenUsageResponse[],
  resolution: Resolution,
  locale: string,
  metric: UsageMetric = "tokens",
): AgentSeries {
  return buildBreakdownSeries(days, resolution, locale, metric, "agent");
}

export function buildHeatmapWeeks(
  days: DailyTokenUsageResponse[],
  year: string,
  metric: UsageMetric = "tokens",
): HeatmapWeek[] {
  if (!year) {
    return [];
  }

  const start = startOfWeek(startOfYear(new Date(Number(year), 0, 1)), { weekStartsOn: 0 });
  const end = endOfWeek(endOfYear(new Date(Number(year), 0, 1)), { weekStartsOn: 0 });
  const dayMap = new Map(days.map((day) => [day.date, day]));
  const maxValue = days.reduce(
    (max, day) =>
      day.date.startsWith(`${year}-`)
        ? Math.max(max, dayMetricValue(day, metric))
        : max,
    0,
  );
  const calendarDays = eachDayOfInterval({ start, end });

  const weeks: HeatmapWeek[] = [];
  for (let index = 0; index < calendarDays.length; index += 7) {
    const weekDays = calendarDays.slice(index, index + 7);

    weeks.push({
      cells: weekDays.map((day) => {
        const isoDate = format(day, "yyyy-MM-dd");
        const isTargetYear = format(day, "yyyy") === year;
        const detail = isTargetYear ? (dayMap.get(isoDate) ?? null) : null;
        const count = isTargetYear
          ? detail
            ? dayMetricValue(detail, metric)
            : 0
          : null;

        return {
          date: isoDate,
          count,
          level: heatmapLevel(count, maxValue),
          detail,
        };
      }),
    });
  }

  return weeks;
}

export function buildHeatmapMonthLabels(
  weeks: HeatmapWeek[],
  year: string,
  locale: string,
): HeatmapMonthLabel[] {
  if (!year) {
    return [];
  }

  return Array.from({ length: 12 }, (_, monthIndex) => {
    const monthPrefix = `${year}-${String(monthIndex + 1).padStart(2, "0")}-`;
    const weekIndex = weeks.findIndex((week) =>
      week.cells.some((cell) => cell.date.startsWith(monthPrefix)),
    );

    if (weekIndex < 0) {
      return null;
    }

    return {
      label: new Intl.DateTimeFormat(locale, { month: "short" }).format(
        new Date(Number(year), monthIndex, 1),
      ),
      offset: weekIndex * (HEATMAP_CELL_SIZE + HEATMAP_GAP),
    };
  }).filter((value): value is HeatmapMonthLabel => value !== null);
}

export function calculateHeatmapPopoverPosition(anchorRect: HeatmapHoverState["anchorRect"]) {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const anchorCenterX = anchorRect.left + anchorRect.width / 2;
  const prefersRight = anchorCenterX < viewportWidth / 2;
  const unclampedX = prefersRight
    ? anchorRect.left + anchorRect.width + HEATMAP_POPOVER_OFFSET
    : anchorRect.left - HEATMAP_POPOVER_WIDTH - HEATMAP_POPOVER_OFFSET;
  const unclampedY = anchorRect.top - HEATMAP_POPOVER_HEIGHT - 18;

  return {
    x: Math.max(16, Math.min(unclampedX, viewportWidth - HEATMAP_POPOVER_WIDTH - 16)),
    y: Math.max(16, Math.min(unclampedY, viewportHeight - HEATMAP_POPOVER_HEIGHT - 16)),
  };
}

export function getAnchorRect(target: HTMLElement) {
  const rect = target.getBoundingClientRect();
  return {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
  };
}

export function summarizeYear(days: DailyTokenUsageResponse[], year: string): YearBreakdownSummary {
  if (!year) {
    return {
      totalTokens: 0,
      totalCost: 0,
      totalMessages: 0,
      activeDays: 0,
      input: 0,
      output: 0,
      cache: 0,
      reasoning: 0,
    };
  }

  return days.reduce(
    (summary, day) => {
      if (!day.date.startsWith(`${year}-`)) {
        return summary;
      }

      summary.totalTokens += day.total_tokens;
      summary.totalCost += day.total_cost_usd ?? 0;
      summary.totalMessages += day.message_count;
      summary.activeDays += 1;
      summary.input += day.breakdown.input_tokens;
      summary.output += day.breakdown.output_tokens;
      summary.cache += day.breakdown.cache_read_tokens + day.breakdown.cache_write_tokens;
      summary.reasoning += day.breakdown.reasoning_tokens;
      return summary;
    },
    {
      totalTokens: 0,
      totalCost: 0,
      totalMessages: 0,
      activeDays: 0,
      input: 0,
      output: 0,
      cache: 0,
      reasoning: 0,
    },
  );
}

export function buildYearBreakdownShares(
  days: DailyTokenUsageResponse[],
  year: string,
  metric: UsageMetric = "tokens",
  dimension: UsageDimension = "agent",
  otherLabel = "Other",
): BreakdownShare[] {
  if (!year) {
    return [];
  }

  const totals = new Map<string, number>();

  for (const day of days) {
    if (!day.date.startsWith(`${year}-`)) {
      continue;
    }

    for (const client of day.by_client) {
      const id = dimensionKeyOf(client, dimension);
      const amount = clientDayMetricValue(client, metric);
      totals.set(id, (totals.get(id) ?? 0) + amount);
    }
  }

  const totalValue = Array.from(totals.values()).reduce((sum, value) => sum + value, 0);
  if (totalValue <= 0) {
    return [];
  }

  return Array.from(totals.entries())
    .sort((left, right) => right[1] - left[1])
    .slice(0, 5)
    .map(([id, value]) => ({
      id,
      label: formatDimensionLabel(id, dimension, otherLabel),
      value,
      share: value / totalValue,
      sharePercent: (value / totalValue) * 100,
    }));
}

export function buildYearAgentShares(
  days: DailyTokenUsageResponse[],
  year: string,
  metric: UsageMetric = "tokens",
): YearAgentShare[] {
  return buildYearBreakdownShares(days, year, metric, "agent").map((row) => ({
    ...row,
    clientId: row.id,
  }));
}

/**
 * All-time share bars from overview.by_client / by_model.
 * Model rows are aggregated by model_id across clients.
 */
export function buildOverviewBreakdownShares(
  overview: {
    by_client: Array<{
      client_id: string;
      total_tokens: number;
      total_cost_usd: number | null;
    }>;
    by_model: Array<{
      model_id: string;
      total_tokens: number;
      cost_usd: number | null;
    }>;
  } | null | undefined,
  metric: UsageMetric,
  dimension: UsageDimension,
  otherLabel = "Other",
): BreakdownShare[] {
  if (!overview) return [];

  const totals = new Map<string, number>();

  if (dimension === "model") {
    for (const row of overview.by_model ?? []) {
      const id = row.model_id.trim() || "unknown";
      const amount = modelOverviewMetricValue(row, metric);
      totals.set(id, (totals.get(id) ?? 0) + amount);
    }
  } else {
    for (const row of overview.by_client ?? []) {
      const amount = clientOverviewMetricValue(row, metric);
      totals.set(row.client_id, (totals.get(row.client_id) ?? 0) + amount);
    }
  }

  const totalValue = Array.from(totals.values()).reduce((sum, value) => sum + value, 0);
  if (totalValue <= 0) {
    return [];
  }

  return Array.from(totals.entries())
    .sort((left, right) => right[1] - left[1])
    .slice(0, 5)
    .map(([id, value]) => ({
      id,
      label: formatDimensionLabel(id, dimension, otherLabel),
      value,
      share: value / totalValue,
      sharePercent: (value / totalValue) * 100,
    }));
}

export function calculateYearAgentRadarMax(data: BreakdownShare[]) {
  const maxShare = Math.max(...data.map((item) => item.sharePercent), 0);
  if (maxShare <= 0) {
    return 100;
  }

  return Math.max(20, Math.ceil((maxShare * 1.15) / 5) * 5);
}

export function mergeYearLists(
  incoming: string[],
  byDay: DailyTokenUsageResponse[],
): string[] {
  const inferred = byDay.map((day) => day.date.slice(0, 4));
  return Array.from(new Set([...incoming, ...inferred])).sort((left, right) =>
    left.localeCompare(right),
  );
}

function heatmapLevel(count: number | null, maxTokens: number): 0 | 1 | 2 | 3 | 4 {
  if (count === null) {
    return 0;
  }

  if (maxTokens <= 0 || count <= 0) {
    return 0;
  }

  const ratio = count / maxTokens;
  if (ratio < 0.2) return 1;
  if (ratio < 0.45) return 2;
  if (ratio < 0.7) return 3;
  return 4;
}

export function heatmapColor(
  level: 0 | 1 | 2 | 3 | 4,
  palette: readonly [string, string, string, string, string],
) {
  return palette[level];
}

export function formatHeatmapDate(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(parseISO(value));
}

export function formatHeatmapAriaLabel(
  cell: HeatmapCell,
  locale: string,
  formatter: (values: { date: string; tokens: string; messages: string }) => string,
) {
  return formatter({
    date: formatHeatmapDate(cell.date, locale),
    tokens: formatDetailedNumber(cell.count ?? 0, locale),
    messages: formatDetailedNumber(cell.detail?.message_count ?? 0, locale),
  });
}

export function formatDetailedNumber(value: number, locale: string) {
  return value.toLocaleString(locale);
}

export function formatPercent(value: number, locale: string) {
  return new Intl.NumberFormat(locale, {
    style: "percent",
    maximumFractionDigits: value >= 0.1 ? 0 : 1,
  }).format(value);
}

export function sortDailyUsage(days: DailyTokenUsageResponse[]) {
  return [...days].sort((left, right) => left.date.localeCompare(right.date));
}

function periodKeysForRange(days: DailyTokenUsageResponse[], resolution: Resolution) {
  const firstDay = days[0];
  const lastDay = days[days.length - 1];

  if (!firstDay || !lastDay) {
    return [];
  }

  if (resolution === "month") {
    const keys: string[] = [];
    let cursor = parseISO(`${firstDay.date.slice(0, 7)}-01`);
    const end = parseISO(`${lastDay.date.slice(0, 7)}-01`);

    while (cursor <= end) {
      keys.push(format(cursor, "yyyy-MM"));
      cursor = addMonths(cursor, 1);
    }

    return keys;
  }

  const keys: string[] = [];
  let cursor = parseISO(firstDay.date);
  const end = parseISO(lastDay.date);

  while (cursor <= end) {
    keys.push(format(cursor, "yyyy-MM-dd"));
    cursor = addDays(cursor, 1);
  }

  return keys;
}

function formatPeriodLabel(key: string, resolution: Resolution, locale: string) {
  return resolution === "day"
    ? new Intl.DateTimeFormat(locale, { month: "short", day: "numeric" }).format(parseISO(key))
    : new Intl.DateTimeFormat(locale, { month: "short" }).format(parseISO(`${key}-01`));
}

export function formatCompactNumber(value: number, locale: string) {
  return new Intl.NumberFormat(locale, {
    notation: "compact",
    maximumFractionDigits: value >= 1_000_000 ? 1 : 0,
  }).format(value);
}

export function formatCurrencyCompact(value: number | null, locale: string) {
  if (value === null) {
    return "--";
  }

  if (value < 1) {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  }

  return new Intl.NumberFormat(locale, {
    notation: "compact",
    maximumFractionDigits: 1,
    style: "currency",
    currency: "USD",
  }).format(value);
}

/** More precise USD for tooltips / detail rows. */
export function formatCurrencyDetailed(value: number | null, locale: string) {
  if (value === null) {
    return "--";
  }

  const abs = Math.abs(value);
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: abs > 0 && abs < 0.01 ? 4 : 2,
  }).format(value);
}

/** Format chart/stat values for the active metric. */
export function formatMetricValue(
  value: number,
  metric: UsageMetric,
  locale: string,
  mode: "compact" | "detailed" = "compact",
): string {
  if (metric === "cost") {
    return mode === "detailed"
      ? formatCurrencyDetailed(value, locale)
      : formatCurrencyCompact(value, locale);
  }
  return mode === "detailed"
    ? formatDetailedNumber(value, locale)
    : formatCompactNumber(value, locale);
}

export function formatAxisTokens(value: number, locale: string) {
  return new Intl.NumberFormat(locale, {
    notation: "compact",
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatTooltipTokens(
  value: number,
  locale: string,
  formatter: (values: { value: string }) => string,
) {
  return formatter({
    value: formatDetailedNumber(value, locale),
  });
}

export function formatGeneratedAt(value: number, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value * 1000));
}

export function humanizeId(value: string) {
  return value
    .split(/[-_]/g)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}
