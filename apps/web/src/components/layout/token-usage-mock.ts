import { format, startOfWeek, subDays } from "date-fns";

export type TokenUsageStat = {
  label: string;
  value: string;
  change: string;
  note: string;
};

export type MonthlyTrendPoint = {
  month: string;
  tokens: number;
  sessions: number;
};

export type AgentUsagePoint = {
  agent: string;
  tokens: number;
  sessions: number;
};

export type TokenMixPoint = {
  key: string;
  label: string;
  value: number;
  fill: string;
};

export type HeatmapCell = {
  date: string;
  count: number | null;
  level: 0 | 1 | 2 | 3 | 4;
};

export type HeatmapWeek = {
  label: string;
  cells: HeatmapCell[];
};

export const tokenUsageStats: TokenUsageStat[] = [
  {
    label: "Total tokens",
    value: "48.2M",
    change: "+18.4%",
    note: "Rolling 26-week mock dataset",
  },
  {
    label: "Active days",
    value: "143",
    change: "+9 days",
    note: "Only counting days above 20k tokens",
  },
  {
    label: "Avg / session",
    value: "118k",
    change: "-4.2%",
    note: "Prompt-to-response bundle size",
  },
  {
    label: "Est. cost",
    value: "$612",
    change: "+11.9%",
    note: "Derived from mocked pricing bands",
  },
];

export const monthlyTrend: MonthlyTrendPoint[] = [
  { month: "Oct", tokens: 4_100_000, sessions: 221 },
  { month: "Nov", tokens: 5_000_000, sessions: 246 },
  { month: "Dec", tokens: 6_200_000, sessions: 289 },
  { month: "Jan", tokens: 7_100_000, sessions: 305 },
  { month: "Feb", tokens: 8_400_000, sessions: 344 },
  { month: "Mar", tokens: 9_300_000, sessions: 386 },
];

export const agentUsage: AgentUsagePoint[] = [
  { agent: "Claude", tokens: 16_900_000, sessions: 421 },
  { agent: "Codex", tokens: 13_200_000, sessions: 365 },
  { agent: "Cursor", tokens: 9_600_000, sessions: 274 },
  { agent: "Gemini", tokens: 5_800_000, sessions: 192 },
  { agent: "OpenCode", tokens: 2_700_000, sessions: 91 },
];

export const tokenMix: TokenMixPoint[] = [
  { key: "input", label: "Input", value: 19_400_000, fill: "var(--color-chart-1)" },
  { key: "output", label: "Output", value: 15_200_000, fill: "var(--color-chart-2)" },
  { key: "cache", label: "Cache read", value: 8_900_000, fill: "var(--color-chart-3)" },
  { key: "reasoning", label: "Reasoning", value: 4_700_000, fill: "var(--color-chart-4)" },
];

export const heatmapWeeks = buildHeatmapWeeks(26);

function buildHeatmapWeeks(weekCount: number): HeatmapWeek[] {
  const totalDays = weekCount * 7;
  const end = new Date();
  end.setHours(0, 0, 0, 0);

  const rawStart = subDays(end, totalDays - 1);
  const alignedStart = startOfWeek(rawStart, { weekStartsOn: 0 });

  const weeks: HeatmapWeek[] = [];
  const cursor = new Date(alignedStart);

  for (let weekIndex = 0; weekIndex < weekCount; weekIndex += 1) {
    const cells: HeatmapCell[] = [];
    const monthLabel = format(cursor, "MMM");

    for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
      const current = new Date(cursor);
      const isPadding = current < rawStart || current > end;
      const count = isPadding ? null : seededDailyCount(weekIndex, dayIndex);
      cells.push({
        date: format(current, "yyyy-MM-dd"),
        count,
        level: isPadding ? 0 : toHeatmapLevel(count),
      });
      cursor.setDate(cursor.getDate() + 1);
    }

    weeks.push({
      label:
        weekIndex === 0 || monthLabel !== weeks[weeks.length - 1]?.label
          ? monthLabel
          : "",
      cells,
    });
  }

  return weeks;
}

function seededDailyCount(weekIndex: number, dayIndex: number): number {
  const weekdayWeight = [0.48, 0.76, 0.9, 1, 0.86, 0.58, 0.32][dayIndex] ?? 0.5;
  const wave = Math.sin((weekIndex + 2) * 0.75 + dayIndex * 0.35) * 0.5 + 0.5;
  const surge = Math.cos((weekIndex + 1) * 0.4 - dayIndex * 0.6) * 0.5 + 0.5;
  const tokens = 8_000 + weekdayWeight * 72_000 + wave * 22_000 + surge * 14_000;
  return Math.round(tokens);
}

function toHeatmapLevel(count: number | null): 0 | 1 | 2 | 3 | 4 {
  if (!count || count < 20_000) return 0;
  if (count < 45_000) return 1;
  if (count < 70_000) return 2;
  if (count < 95_000) return 3;
  return 4;
}
