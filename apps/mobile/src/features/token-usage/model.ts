import {
  addDays,
  addMonths,
  eachDayOfInterval,
  endOfWeek,
  endOfYear,
  format,
  parseISO,
  startOfWeek,
  startOfYear,
} from "date-fns";
import type { DailyTokenUsageResponse, TokenUsageOverviewResponse } from "@atmos/api-types/ws/dto/token-usage";

export type Resolution = "month" | "day";
export type UsageMetric = "tokens" | "cost";
export type UsageDimension = "agent" | "model";

export type HeatmapCell = {
  date: string;
  count: number | null;
  level: 0 | 1 | 2 | 3 | 4;
  detail: DailyTokenUsageResponse | null;
};
export type HeatmapWeek = { cells: HeatmapCell[] };
export type BreakdownShare = {
  id: string;
  label: string;
  value: number;
  sharePercent: number;
  providerId?: string;
};

export const MIX_COLORS_DARK = ["#38BDF8", "#4ADE80", "#E879F9", "#FBBF24", "#94A3B8"] as const;
export const MIX_COLORS_LIGHT = ["#0284C7", "#16A34A", "#C026D3", "#D97706", "#64748B"] as const;
export const HEATMAP_DARK = ["#2f2f35", "#13362a", "#165742", "#11825f", "#12b886"] as const;
export const HEATMAP_LIGHT = ["#ececf1", "#d0ece6", "#9edacd", "#5fc1ae", "#20a689"] as const;

const PALETTE_DARK = ["#38BDF8", "#F97316", "#A78BFA", "#4ADE80", "#F472B6", "#FBBF24", "#2DD4BF", "#F87171"];
const PALETTE_LIGHT = ["#0284C7", "#EA580C", "#7C3AED", "#16A34A", "#DB2777", "#D97706", "#0D9488", "#DC2626"];
const OTHER = "other";

export function sortDays(days: DailyTokenUsageResponse[]) {
  return [...days].sort((left, right) => left.date.localeCompare(right.date));
}

export function yearList(incoming: string[], days: DailyTokenUsageResponse[]) {
  return Array.from(new Set([...incoming, ...days.map((day) => day.date.slice(0, 4))])).sort();
}

function amount(tokens: number, cost: number | null | undefined, metric: UsageMetric) {
  return metric === "cost" ? (cost ?? 0) : tokens;
}

function humanize(value: string) {
  if (value === OTHER) return "Other";
  const leaf = value.includes("/") ? value.slice(value.lastIndexOf("/") + 1) : value;
  return leaf
    .split(/[-_]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function chartColors(ids: string[], dark: boolean) {
  const palette = dark ? PALETTE_DARK : PALETTE_LIGHT;
  const map = new Map<string, string>();
  ids.forEach((id, index) => {
    map.set(id, id === OTHER ? (dark ? "#64748B" : "#94A3B8") : palette[index % palette.length]!);
  });
  return map;
}

export function overviewShares(
  overview: TokenUsageOverviewResponse | null,
  metric: UsageMetric,
  dimension: UsageDimension,
): BreakdownShare[] {
  if (!overview) return [];
  const totals = new Map<string, number>();
  const providers = new Map<string, string>();
  if (dimension === "model") {
    for (const row of overview.by_model ?? []) {
      const id = row.model_id.trim() || "unknown";
      totals.set(id, (totals.get(id) ?? 0) + amount(row.total_tokens, row.cost_usd, metric));
      if (!providers.has(id) && row.provider_id) providers.set(id, row.provider_id);
    }
  } else {
    for (const row of overview.by_client ?? []) {
      totals.set(row.client_id, (totals.get(row.client_id) ?? 0) + amount(row.total_tokens, row.total_cost_usd, metric));
    }
  }
  const ranked = [...totals.entries()].filter(([id]) => id !== OTHER).sort((a, b) => b[1] - a[1]);
  const top = ranked.slice(0, 5);
  const other = ranked.slice(5).reduce((sum, [, value]) => sum + value, 0) + (totals.get(OTHER) ?? 0);
  const rows = other > 0 ? [...top, [OTHER, other] as [string, number]] : top;
  const total = rows.reduce((sum, [, value]) => sum + value, 0);
  if (total <= 0) return [];
  return rows.map(([id, value]) => ({
    id,
    label: humanize(id),
    value,
    sharePercent: (value / total) * 100,
    providerId: providers.get(id),
  }));
}

export function buildHeatmap(days: DailyTokenUsageResponse[], year: string, metric: UsageMetric): HeatmapWeek[] {
  if (!year) return [];
  const start = startOfWeek(startOfYear(new Date(Number(year), 0, 1)), { weekStartsOn: 0 });
  const end = endOfWeek(endOfYear(new Date(Number(year), 0, 1)), { weekStartsOn: 0 });
  const byDate = new Map(days.map((day) => [day.date, day]));
  let max = 0;
  for (const day of days) {
    if (day.date.startsWith(`${year}-`)) max = Math.max(max, amount(day.total_tokens, day.total_cost_usd, metric));
  }
  const calendar = eachDayOfInterval({ start, end });
  const weeks: HeatmapWeek[] = [];
  for (let index = 0; index < calendar.length; index += 7) {
    weeks.push({
      cells: calendar.slice(index, index + 7).map((day) => {
        const date = format(day, "yyyy-MM-dd");
        const inYear = format(day, "yyyy") === year;
        const detail = inYear ? (byDate.get(date) ?? null) : null;
        const count = inYear ? (detail ? amount(detail.total_tokens, detail.total_cost_usd, metric) : 0) : null;
        return { date, count, level: levelOf(count, max), detail };
      }),
    });
  }
  return weeks;
}

function levelOf(count: number | null, max: number): 0 | 1 | 2 | 3 | 4 {
  if (count === null || max <= 0 || count <= 0) return 0;
  const ratio = count / max;
  if (ratio < 0.2) return 1;
  if (ratio < 0.45) return 2;
  if (ratio < 0.7) return 3;
  return 4;
}

export function monthLabels(weeks: HeatmapWeek[], year: string) {
  return Array.from({ length: 12 }, (_, month) => {
    const prefix = `${year}-${String(month + 1).padStart(2, "0")}-`;
    const weekIndex = weeks.findIndex((week) => week.cells.some((cell) => cell.date.startsWith(prefix)));
    if (weekIndex < 0) return null;
    return {
      label: new Intl.DateTimeFormat("en", { month: "short" }).format(new Date(Number(year), month, 1)),
      weekIndex,
    };
  }).filter((item): item is { label: string; weekIndex: number } => item !== null);
}

function periodKeys(days: DailyTokenUsageResponse[], resolution: Resolution) {
  const first = days[0];
  const last = days[days.length - 1];
  if (!first || !last) return [];
  if (resolution === "month") {
    const keys: string[] = [];
    let cursor = parseISO(`${first.date.slice(0, 7)}-01`);
    const end = parseISO(`${last.date.slice(0, 7)}-01`);
    while (cursor <= end) {
      keys.push(format(cursor, "yyyy-MM"));
      cursor = addMonths(cursor, 1);
    }
    return keys;
  }
  const keys: string[] = [];
  let cursor = parseISO(first.date);
  const end = parseISO(last.date);
  while (cursor <= end) {
    keys.push(format(cursor, "yyyy-MM-dd"));
    cursor = addDays(cursor, 1);
  }
  return keys;
}

function periodLabel(key: string, resolution: Resolution) {
  const date = resolution === "day" ? parseISO(key) : parseISO(`${key}-01`);
  return new Intl.DateTimeFormat("en", resolution === "day" ? { month: "short", day: "numeric" } : { month: "short" }).format(date);
}

export function timeline(days: DailyTokenUsageResponse[], resolution: Resolution, metric: UsageMetric) {
  const buckets = new Map<string, { label: string; value: number }>();
  for (const key of periodKeys(days, resolution)) buckets.set(key, { label: periodLabel(key, resolution), value: 0 });
  for (const day of days) {
    const key = resolution === "day" ? day.date : day.date.slice(0, 7);
    const point = buckets.get(key) ?? { label: periodLabel(key, resolution), value: 0 };
    point.value += amount(day.total_tokens, day.total_cost_usd, metric);
    buckets.set(key, point);
  }
  return [...buckets.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([, point]) => point);
}

export function stacked(
  days: DailyTokenUsageResponse[],
  resolution: Resolution,
  metric: UsageMetric,
  dimension: UsageDimension,
) {
  const totals = new Map<string, number>();
  const periods = new Map<string, Record<string, number>>();
  for (const key of periodKeys(days, resolution)) periods.set(key, {});
  for (const day of days) {
    const key = resolution === "day" ? day.date : day.date.slice(0, 7);
    const bucket = periods.get(key) ?? {};
    for (const row of day.by_client) {
      const id = dimension === "model" ? row.model_id.trim() || "unknown" : row.client_id;
      const value = amount(row.total_tokens, row.cost_usd, metric);
      bucket[id] = (bucket[id] ?? 0) + value;
      totals.set(id, (totals.get(id) ?? 0) + value);
    }
    periods.set(key, bucket);
  }
  const ranked = [...totals.entries()].filter(([id]) => id !== OTHER).sort((a, b) => b[1] - a[1]).map(([id]) => id);
  const top = ranked.slice(0, 5);
  const hasOther = ranked.length > top.length;
  const keys = hasOther ? [...top, OTHER] : top;
  const rows = [...periods.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([key, bucket]) => ({
    label: periodLabel(key, resolution),
    segments: keys.map((id) => {
      if (id !== OTHER) return bucket[id] ?? 0;
      return Object.entries(bucket).reduce((sum, [name, value]) => (top.includes(name) ? sum : sum + value), 0);
    }),
  }));
  const maxColumns = resolution === "day" ? 10 : 8;
  return { keys, bars: rows.slice(-maxColumns), labels: keys.map(humanize) };
}

export function tokenMix(days: DailyTokenUsageResponse[]) {
  const totals = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, reasoning: 0 };
  for (const day of days) {
    totals.input += day.breakdown.input_tokens;
    totals.output += day.breakdown.output_tokens;
    totals.cacheRead += day.breakdown.cache_read_tokens;
    totals.cacheWrite += day.breakdown.cache_write_tokens;
    totals.reasoning += day.breakdown.reasoning_tokens;
  }
  const total = Object.values(totals).reduce((sum, value) => sum + value, 0) || 1;
  return (Object.keys(totals) as Array<keyof typeof totals>).map((id) => ({
    id,
    value: totals[id],
    sharePercent: (totals[id] / total) * 100,
  }));
}

export function formatDay(value: string) {
  return new Intl.DateTimeFormat("en", { weekday: "short", month: "short", day: "numeric", year: "numeric" }).format(parseISO(value));
}

export function formatUpdated(value: number) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value * 1000));
}
