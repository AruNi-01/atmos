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

import type { DailyTokenUsageResponse } from "@/api/rest-api";
import type { ChartConfig } from "@/components/ui/chart";

export type Resolution = "month" | "day";

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
  totalMessages: number;
  activeDays: number;
  input: number;
  output: number;
  cache: number;
  reasoning: number;
};

export type YearAgentShare = {
  clientId: string;
  label: string;
  tokens: number;
  share: number;
  sharePercent: number;
};

export const curveChartConfig = {
  tokens: {
    label: "Tokens",
    color: "var(--color-chart-1)",
  },
  messages: {
    label: "Messages",
    color: "var(--color-chart-3)",
  },
} satisfies ChartConfig;

export const tokenMixChartConfig = {
  input: {
    label: "Input",
    color: "var(--color-chart-1)",
  },
  output: {
    label: "Output",
    color: "var(--color-chart-2)",
  },
  cache: {
    label: "Cache",
    color: "var(--color-chart-3)",
  },
  reasoning: {
    label: "Reasoning",
    color: "var(--color-chart-4)",
  },
} satisfies ChartConfig;

export const heatmapAgentRadarChartConfig = {
  share: {
    label: "Share",
    color: "var(--color-chart-2)",
  },
} satisfies ChartConfig;

export const heatmapDayLabels = [
  { label: "Mon", row: 1 },
  { label: "Wed", row: 3 },
  { label: "Fri", row: 5 },
] as const;

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
): TimelinePoint[] {
  const buckets = new Map<string, TimelinePoint>(
    periodKeysForRange(days, resolution).map((key) => [
      key,
      {
        key,
        label: formatPeriodLabel(key, resolution),
        tokens: 0,
        messages: 0,
        input: 0,
        output: 0,
        cache: 0,
        reasoning: 0,
      },
    ]),
  );

  for (const day of days) {
    const key = resolution === "day" ? day.date : day.date.slice(0, 7);
    const existing = buckets.get(key) ?? {
      key,
      label: formatPeriodLabel(key, resolution),
      tokens: 0,
      messages: 0,
      input: 0,
      output: 0,
      cache: 0,
      reasoning: 0,
    };

    existing.tokens += day.total_tokens;
    existing.messages += day.message_count;
    existing.input += day.breakdown.input_tokens;
    existing.output += day.breakdown.output_tokens;
    existing.cache += day.breakdown.cache_read_tokens + day.breakdown.cache_write_tokens;
    existing.reasoning += day.breakdown.reasoning_tokens;

    buckets.set(key, existing);
  }

  return Array.from(buckets.values()).sort((left, right) => left.key.localeCompare(right.key));
}

export function buildAgentSeries(
  days: DailyTokenUsageResponse[],
  resolution: Resolution,
): AgentSeries {
  const totals = new Map<string, number>();
  const periods = new Map<string, Record<string, number>>(
    periodKeysForRange(days, resolution).map((key) => [key, {}]),
  );

  for (const day of days) {
    const periodKey = resolution === "day" ? day.date : day.date.slice(0, 7);
    const bucket = periods.get(periodKey) ?? {};

    for (const client of day.by_client) {
      bucket[client.client_id] = (bucket[client.client_id] ?? 0) + client.total_tokens;
      totals.set(client.client_id, (totals.get(client.client_id) ?? 0) + client.total_tokens);
    }

    periods.set(periodKey, bucket);
  }

  const rankedClients = Array.from(totals.entries())
    .sort((left, right) => right[1] - left[1])
    .map(([clientId]) => clientId);

  const topClients = rankedClients.slice(0, 5);
  const topClientSet = new Set(topClients);
  const hasOther = rankedClients.length > topClients.length;
  const keys = hasOther ? [...topClients, "other"] : topClients;

  const data = Array.from(periods.entries())
    .sort((left, right) => left[0].localeCompare(right[0]))
    .map(([periodKey, bucket]) => {
      const point: Record<string, string | number> = {
        label: formatPeriodLabel(periodKey, resolution),
      };

      let other = 0;
      for (const [clientId, value] of Object.entries(bucket)) {
        if (topClientSet.has(clientId)) {
          point[clientId] = value;
        } else {
          other += value;
        }
      }

      for (const clientId of topClients) {
        if (!(clientId in point)) {
          point[clientId] = 0;
        }
      }

      if (hasOther) {
        point.other = other;
      }

      return point;
    });

  return { data, keys };
}

export function buildHeatmapWeeks(days: DailyTokenUsageResponse[], year: string): HeatmapWeek[] {
  if (!year) {
    return [];
  }

  const start = startOfWeek(startOfYear(new Date(Number(year), 0, 1)), { weekStartsOn: 0 });
  const end = endOfWeek(endOfYear(new Date(Number(year), 0, 1)), { weekStartsOn: 0 });
  const dayMap = new Map(days.map((day) => [day.date, day]));
  const maxTokens = days.reduce(
    (max, day) => (day.date.startsWith(`${year}-`) ? Math.max(max, day.total_tokens) : max),
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
        const count = isTargetYear ? (detail?.total_tokens ?? 0) : null;

        return {
          date: isoDate,
          count,
          level: heatmapLevel(count, maxTokens),
          detail,
        };
      }),
    });
  }

  return weeks;
}

export function buildHeatmapMonthLabels(weeks: HeatmapWeek[], year: string): HeatmapMonthLabel[] {
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
      label: format(new Date(Number(year), monthIndex, 1), "MMM"),
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
      totalMessages: 0,
      activeDays: 0,
      input: 0,
      output: 0,
      cache: 0,
      reasoning: 0,
    },
  );
}

export function buildYearAgentShares(days: DailyTokenUsageResponse[], year: string): YearAgentShare[] {
  if (!year) {
    return [];
  }

  const totals = new Map<string, number>();

  for (const day of days) {
    if (!day.date.startsWith(`${year}-`)) {
      continue;
    }

    for (const client of day.by_client) {
      totals.set(client.client_id, (totals.get(client.client_id) ?? 0) + client.total_tokens);
    }
  }

  const totalTokens = Array.from(totals.values()).reduce((sum, value) => sum + value, 0);
  if (totalTokens <= 0) {
    return [];
  }

  return Array.from(totals.entries())
    .sort((left, right) => right[1] - left[1])
    .slice(0, 5)
    .map(([clientId, tokens]) => ({
      clientId,
      label: humanizeId(clientId),
      tokens,
      share: tokens / totalTokens,
      sharePercent: (tokens / totalTokens) * 100,
    }));
}

export function calculateYearAgentRadarMax(data: YearAgentShare[]) {
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

export function formatHeatmapDate(value: string) {
  return format(parseISO(value), "EEE, MMM d, yyyy");
}

export function formatHeatmapAriaLabel(cell: HeatmapCell) {
  return `${formatHeatmapDate(cell.date)}: ${formatDetailedNumber(cell.count ?? 0)} tokens, ${formatDetailedNumber(cell.detail?.message_count ?? 0)} messages`;
}

export function formatDetailedNumber(value: number) {
  return value.toLocaleString();
}

export function formatPercent(value: number) {
  return new Intl.NumberFormat("en", {
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

function formatPeriodLabel(key: string, resolution: Resolution) {
  return resolution === "day"
    ? format(parseISO(key), "MMM d")
    : format(parseISO(`${key}-01`), "MMM yyyy");
}

export function formatCompactNumber(value: number) {
  return new Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: value >= 1_000_000 ? 1 : 0,
  }).format(value);
}

export function formatCurrencyCompact(value: number | null) {
  if (value === null) {
    return "--";
  }

  if (value < 1) {
    return `$${value.toFixed(2)}`;
  }

  return new Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: 1,
    style: "currency",
    currency: "USD",
  }).format(value);
}

export function formatAxisTokens(value: number) {
  if (value >= 1_000_000) {
    return `${Math.round(value / 1_000_000)}M`;
  }
  if (value >= 1_000) {
    return `${Math.round(value / 1_000)}k`;
  }
  return `${Math.round(value)}`;
}

export function formatTooltipTokens(value: number) {
  return `${value.toLocaleString()} tokens`;
}

export function formatGeneratedAt(value: number) {
  return new Intl.DateTimeFormat("en", {
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
