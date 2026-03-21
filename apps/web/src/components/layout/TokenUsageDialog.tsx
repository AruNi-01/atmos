"use client";

import * as React from "react";
import { createPortal } from "react-dom";
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
import {
  Activity,
  CalendarRange,
  ChartColumnBig,
  Coins,
  MessagesSquare,
  RefreshCcw,
  Sparkles,
  Wallet,
  X,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";

import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Tabs,
  TabsList,
  TabsTrigger,
  TextScramble,
} from "@workspace/ui";

import {
  tokenUsageApi,
  type DailyTokenUsageResponse,
  type TokenUsageOverviewResponse,
  type TokenUsageUpdateResponse,
} from "@/api/rest-api";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { useWebSocketStore } from "@/hooks/use-websocket";
import { useTheme } from "next-themes";

type Resolution = "month" | "day";

type HeatmapCell = {
  date: string;
  count: number | null;
  level: 0 | 1 | 2 | 3 | 4;
  detail: DailyTokenUsageResponse | null;
};

type HeatmapWeek = {
  cells: HeatmapCell[];
};

type HeatmapMonthLabel = {
  label: string;
  offset: number;
};

type HeatmapHoverState = {
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

type TimelinePoint = {
  key: string;
  label: string;
  tokens: number;
  messages: number;
  input: number;
  output: number;
  cache: number;
  reasoning: number;
};

type AgentSeries = {
  data: Array<Record<string, string | number>>;
  keys: string[];
};

type YearBreakdownSummary = {
  totalTokens: number;
  totalMessages: number;
  activeDays: number;
  input: number;
  output: number;
  cache: number;
  reasoning: number;
};

type YearAgentShare = {
  clientId: string;
  label: string;
  tokens: number;
  share: number;
  sharePercent: number;
};

const curveChartConfig = {
  tokens: {
    label: "Tokens",
    color: "var(--color-chart-1)",
  },
  messages: {
    label: "Messages",
    color: "var(--color-chart-3)",
  },
} satisfies ChartConfig;

const tokenMixChartConfig = {
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

const heatmapAgentRadarChartConfig = {
  share: {
    label: "Share",
    color: "var(--color-chart-2)",
  },
} satisfies ChartConfig;

const heatmapDayLabels = [
  { label: "Mon", row: 1 },
  { label: "Wed", row: 3 },
  { label: "Fri", row: 5 },
] as const;

const HEATMAP_CELL_SIZE = 12;
const HEATMAP_GAP = 5;
const HEATMAP_DAY_LABEL_WIDTH = 52;
const HEATMAP_COLUMN_GAP = 16;
const HEATMAP_HEADER_HEIGHT = 28;
const HEATMAP_POPOVER_WIDTH = 244;
const HEATMAP_POPOVER_OFFSET = 64;
const HEATMAP_POPOVER_HEIGHT = 184;

const agentPalette = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "color-mix(in oklch, var(--color-chart-1) 62%, var(--color-chart-2))",
  "color-mix(in oklch, var(--color-chart-2) 58%, var(--color-chart-3))",
];

const darkHeatmapPalette = [
  "#2f2f35",
  "#13362a",
  "#165742",
  "#11825f",
  "#12b886",
] as const;

const lightHeatmapPalette = [
  "#ececf1",
  "#d0ece6",
  "#9edacd",
  "#5fc1ae",
  "#20a689",
] as const;

type TokenUsageDialogProps = {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  hideTrigger?: boolean;
};

export function TokenUsageDialog({
  open: openProp,
  onOpenChange,
  hideTrigger = false,
}: TokenUsageDialogProps = {}) {
  const [internalOpen, setInternalOpen] = React.useState(false);
  const open = openProp ?? internalOpen;
  const setOpen = React.useCallback(
    (nextOpen: boolean) => {
      if (openProp === undefined) {
        setInternalOpen(nextOpen);
      }
      onOpenChange?.(nextOpen);
    },
    [onOpenChange, openProp],
  );
  const [overview, setOverview] = React.useState<TokenUsageOverviewResponse | null>(null);
  const [selectedYear, setSelectedYear] = React.useState("");
  const [resolution, setResolution] = React.useState<Resolution>("month");
  const [loading, setLoading] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [hoveredHeatmapCell, setHoveredHeatmapCell] = React.useState<HeatmapHoverState | null>(null);
  const [chartsReady, setChartsReady] = React.useState(false);
  const requestRef = React.useRef(0);
  const { resolvedTheme } = useTheme();
  const onEvent = useWebSocketStore((state) => state.onEvent);
  const isDarkTheme = resolvedTheme !== "light";
  const heatmapPalette = isDarkTheme ? darkHeatmapPalette : lightHeatmapPalette;

  const loadOverview = React.useCallback(
    async ({ refresh = false }: { refresh?: boolean } = {}) => {
      const requestId = requestRef.current + 1;
      requestRef.current = requestId;

      setError(null);
      if (refresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      try {
        const next = await tokenUsageApi.getOverview({
          refresh,
        });

        if (requestRef.current !== requestId) {
          return;
        }

        React.startTransition(() => {
          setOverview(next);
        });
      } catch (loadError) {
        if (requestRef.current !== requestId) {
          return;
        }

        setError(
          loadError instanceof Error ? loadError.message : "Failed to load token usage overview",
        );
      } finally {
        if (requestRef.current === requestId) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [],
  );

  const deferredOverview = React.useDeferredValue(overview);
  const sortedDays = React.useMemo(
    () => sortDailyUsage(deferredOverview?.by_day ?? []),
    [deferredOverview?.by_day],
  );
  const availableYears = React.useMemo(
    () => mergeYearLists(deferredOverview?.available_years ?? [], sortedDays),
    [deferredOverview?.available_years, sortedDays],
  );

  React.useEffect(() => {
    if (selectedYear) {
      return;
    }

    const latestYear = availableYears[availableYears.length - 1];
    if (latestYear) {
      setSelectedYear(latestYear);
    }
  }, [availableYears, selectedYear]);

  React.useEffect(() => {
    if (!open) {
      setChartsReady(false);
      return;
    }

    void loadOverview();
  }, [loadOverview, open]);

  React.useEffect(() => {
    if (!open || !overview || chartsReady) {
      return;
    }

    let cancelled = false;

    const activate = () => {
      if (!cancelled) {
        React.startTransition(() => {
          setChartsReady(true);
        });
      }
    };

    if (
      typeof window !== "undefined" &&
      typeof window.requestIdleCallback === "function" &&
      typeof window.cancelIdleCallback === "function"
    ) {
      const idleId = window.requestIdleCallback(activate, { timeout: 250 });
      return () => {
        cancelled = true;
        window.cancelIdleCallback(idleId);
      };
    }

    const timeoutId = globalThis.setTimeout(activate, 120);
    return () => {
      cancelled = true;
      globalThis.clearTimeout(timeoutId);
    };
  }, [chartsReady, open, overview]);

  React.useEffect(() => {
    if (!open) {
      return;
    }

    return onEvent("token_usage_updated", (payload: unknown) => {
      const update = payload as TokenUsageUpdateResponse | null;
      if (!update?.overview) {
        return;
      }

      const eventYear = update.overview.query.year ?? "";
      if (!eventYear) {
        React.startTransition(() => {
          setOverview(update.overview);
        });
        return;
      }

      void loadOverview({ refresh: true });
    });
  }, [loadOverview, onEvent, open]);

  const heatmapYear = selectedYear || availableYears[availableYears.length - 1] || "";

  React.useEffect(() => {
    setHoveredHeatmapCell(null);
  }, [heatmapYear, overview?.generated_at]);

  const timelineSeries = React.useMemo(
    () => buildTimelineSeries(sortedDays, resolution),
    [resolution, sortedDays],
  );

  const heatmapWeeks = React.useMemo(
    () => buildHeatmapWeeks(sortedDays, heatmapYear),
    [heatmapYear, sortedDays],
  );
  const heatmapMonthLabels = React.useMemo(
    () => buildHeatmapMonthLabels(heatmapWeeks, heatmapYear),
    [heatmapWeeks, heatmapYear],
  );
  const heatmapGridWidth = React.useMemo(
    () =>
      heatmapWeeks.length > 0
        ? heatmapWeeks.length * HEATMAP_CELL_SIZE + (heatmapWeeks.length - 1) * HEATMAP_GAP
        : 0,
    [heatmapWeeks.length],
  );
  const heatmapPopoverPosition = React.useMemo(
    () =>
      hoveredHeatmapCell
        ? calculateHeatmapPopoverPosition(hoveredHeatmapCell.anchorRect)
        : null,
    [hoveredHeatmapCell],
  );

  const agentSeries = React.useMemo(
    () => buildAgentSeries(sortedDays, resolution),
    [resolution, sortedDays],
  );

  const heatmapSummary = React.useMemo(
    () => summarizeYear(sortedDays, heatmapYear),
    [heatmapYear, sortedDays],
  );
  const yearlyAgentShares = React.useMemo(
    () => buildYearAgentShares(sortedDays, heatmapYear),
    [heatmapYear, sortedDays],
  );
  const yearlyAgentRadarMax = React.useMemo(
    () => calculateYearAgentRadarMax(yearlyAgentShares),
    [yearlyAgentShares],
  );

  const agentChartConfig = React.useMemo(
    () =>
      Object.fromEntries(
        agentSeries.keys.map((key, index) => [
          key,
          {
            label: key === "other" ? "Other" : humanizeId(key),
            color: agentPalette[index % agentPalette.length],
          },
        ]),
      ) satisfies ChartConfig,
    [agentSeries.keys],
  );
  const generatedAtLabel = overview ? formatGeneratedAt(overview.generated_at) : "Not loaded";
  const rangeLabel =
    overview?.summary.range_start && overview.summary.range_end
      ? `${overview.summary.range_start} -> ${overview.summary.range_end}`
      : "No range";

  const statCards = React.useMemo(
    () => [
      {
        label: "Total tokens",
        value: formatCompactNumber(overview?.summary.total_tokens ?? 0),
        note: rangeLabel,
        icon: Coins,
      },
      {
        label: "Messages",
        value: formatCompactNumber(overview?.summary.total_messages ?? 0),
        note: `${overview?.by_client.length ?? 0} agents detected`,
        icon: MessagesSquare,
      },
      {
        label: "Active days",
        value: formatCompactNumber(overview?.summary.active_days ?? 0),
        note: "All-time contribution footprint",
        icon: CalendarRange,
      },
      {
        label: "Est. cost",
        value: formatCurrencyCompact(overview?.summary.total_cost_usd ?? null),
        note: "Estimated from local session history",
        icon: Wallet,
      },
    ],
    [overview, rangeLabel],
  );

  const handleRefresh = React.useCallback(() => {
    void loadOverview({ refresh: true });
  }, [loadOverview]);

  const showInitialSkeleton = loading && !overview;
  const showDeferredChartSkeleton = !showInitialSkeleton && !!overview && !chartsReady;
  const emptyState = !loading && !error && !!overview && heatmapSummary.activeDays === 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!hideTrigger ? (
        <DialogTrigger asChild>
          <button
            aria-label="Token usage"
            className="size-8 flex items-center justify-center rounded-md text-muted-foreground transition-colors duration-200 ease-out hover:bg-accent hover:text-accent-foreground"
            title="Token usage"
          >
            <ChartColumnBig className="size-4" />
          </button>
        </DialogTrigger>
      ) : null}

      <DialogContent
        showCloseButton={false}
        className="top-1/2 left-1/2 h-[100dvh] w-[100vw] max-w-[100vw] translate-x-[-50%] translate-y-[-50%] gap-0 overflow-hidden rounded-none border-0 p-0 sm:h-[calc(100dvh-2rem)] sm:w-[calc(100vw-2rem)] sm:max-w-[calc(100vw-2rem)] sm:rounded-[28px] sm:border sm:border-border/70"
      >
        <DialogHeader className="sr-only">
          <DialogTitle>Token usage</DialogTitle>
          <DialogDescription>
            Full-screen token usage dashboard based on local session history.
          </DialogDescription>
        </DialogHeader>

        <div
          className="relative flex h-full min-h-0 flex-col bg-background"
          style={{
            backgroundImage: [
              "radial-gradient(circle at top left, color-mix(in oklch, var(--color-chart-1) 18%, transparent), transparent 28%)",
              "radial-gradient(circle at top right, color-mix(in oklch, var(--color-chart-2) 15%, transparent), transparent 26%)",
              "linear-gradient(180deg, color-mix(in oklch, var(--muted) 62%, transparent), transparent 24%)",
            ].join(", "),
          }}
        >
          <div className="shrink-0 border-b border-border/60 px-4 py-4 sm:px-6 sm:py-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    variant="outline"
                    className="rounded-full border-border/70 bg-background/70 px-3 py-1 text-[10px] tracking-[0.08em] text-muted-foreground"
                  >
                    Local session data
                  </Badge>
                  <Badge
                    variant="outline"
                    className="rounded-full border-border/70 bg-background/70 px-3 py-1 text-[10px] tracking-[0.08em] text-muted-foreground"
                  >
                    All time overview
                  </Badge>
                  {overview?.partial_warnings.length ? (
                    <Badge
                      variant="outline"
                      className="rounded-full border-amber-500/30 bg-amber-500/10 px-3 py-1 text-[10px] tracking-[0.08em] text-amber-700 dark:text-amber-300"
                    >
                      Partial data
                    </Badge>
                  ) : null}
                </div>

                <div className="space-y-2">
                  <h1 className="text-left text-2xl font-semibold tracking-tight sm:text-4xl">
                    Token usage cockpit
                  </h1>
                  <p className="max-w-3xl text-sm leading-6 text-muted-foreground sm:text-base">
                    The heatmap is filtered by year. Summary cards and the charts below stay on
                    all-time local session history rather than provider quota APIs.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 self-start">
                <div className="hidden rounded-2xl border border-border/70 bg-background/80 px-3 py-2 text-right backdrop-blur sm:block">
                  <div className="text-[10px] tracking-[0.08em] text-muted-foreground">
                    Last refresh
                  </div>
                  <div className="mt-1 text-sm font-medium">{generatedAtLabel}</div>
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  className="size-10 rounded-lg border-border/70 bg-background/80 backdrop-blur"
                  onClick={handleRefresh}
                  disabled={loading || refreshing}
                >
                  <RefreshCcw className={refreshing ? "size-4 animate-spin" : "size-4"} />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="size-10 rounded-lg border-border/70 bg-background/80 backdrop-blur"
                  onClick={() => setOpen(false)}
                >
                  <X className="size-4" />
                </Button>
              </div>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            <div className="space-y-6 px-4 py-5 pb-10 sm:px-6 sm:py-6 sm:pb-12">
              {error ? (
                <Card className="border-destructive/30 bg-destructive/5 shadow-none">
                  <CardContent className="flex items-center gap-3 py-6">
                    <Activity className="size-4 text-destructive" />
                    <div className="space-y-1">
                      <div className="text-sm font-medium">Failed to load token usage</div>
                      <div className="text-sm text-muted-foreground">{error}</div>
                    </div>
                  </CardContent>
                </Card>
              ) : null}

              <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {showInitialSkeleton
                  ? Array.from({ length: 4 }, (_, index) => (
                      <Card
                        key={`stat-skeleton-${index}`}
                        className="overflow-hidden border-border/70 bg-card/85 shadow-none backdrop-blur"
                      >
                        <CardHeader className="space-y-3 pb-3">
                          <div className="flex items-center justify-between">
                            <Skeleton className="h-3 w-20 rounded-sm" />
                            <Skeleton className="size-9 rounded-full" />
                          </div>
                          <Skeleton className="h-9 w-28 rounded-md" />
                        </CardHeader>
                        <CardContent>
                          <Skeleton className="h-3 w-32 rounded-sm" />
                        </CardContent>
                      </Card>
                    ))
                  : statCards.map((stat) => (
                      <Card
                        key={stat.label}
                        className="overflow-hidden border-border/70 bg-card/85 shadow-none backdrop-blur"
                      >
                        <CardHeader className="space-y-3 pb-3">
                          <div className="flex items-center justify-between">
                            <CardDescription className="text-[11px] tracking-[0.08em] text-muted-foreground">
                              {stat.label}
                            </CardDescription>
                            <div className="rounded-full border border-border/70 bg-muted/55 p-2 text-foreground">
                              <stat.icon className="size-4" />
                            </div>
                          </div>
                          <CardTitle className="text-3xl font-semibold tracking-tight">
                            {stat.value}
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <span className="text-xs text-muted-foreground">{stat.note}</span>
                        </CardContent>
                      </Card>
                    ))}
              </section>

              <section>
                <Card className="border-border/70 bg-card/88 shadow-none backdrop-blur">
                  <CardHeader className="gap-3">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="space-y-1">
                        <CardDescription className="text-[11px] tracking-[0.08em] text-muted-foreground">
                          Contribution heatmap
                        </CardDescription>
                        <CardTitle className="text-2xl font-semibold tracking-tight">
                          {showInitialSkeleton
                            ? "Loading yearly contribution..."
                            : `${formatCompactNumber(heatmapSummary.totalTokens)} tokens in ${heatmapYear || "the selected year"}`}
                        </CardTitle>
                        <p className="text-sm text-muted-foreground">
                          {showInitialSkeleton
                            ? "Building heatmap from local session history"
                            : `${formatCompactNumber(heatmapSummary.activeDays)} active days · ${formatCompactNumber(heatmapSummary.totalMessages)} messages`}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {showInitialSkeleton ? (
                          <Skeleton className="h-10 w-[140px] rounded-sm" />
                        ) : (
                          <Select
                            value={heatmapYear || undefined}
                            onValueChange={(value) => setSelectedYear(value)}
                          >
                            <SelectTrigger className="h-10 w-[140px] rounded-sm border-border/70 bg-background/80 text-sm">
                              <SelectValue placeholder="Select year" />
                            </SelectTrigger>
                            <SelectContent>
                              {[...availableYears].reverse().map((year) => (
                                <SelectItem key={year} value={year}>
                                  {year}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent className="pt-2">
                    <div className="grid items-stretch gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
                      <div className="rounded-[22px] border border-border/70 bg-background/82 p-4 sm:p-6">
                        {showInitialSkeleton ? (
                          <HeatmapSkeleton />
                        ) : emptyState ? (
                          <div className="flex min-h-40 items-center justify-center text-sm text-muted-foreground">
                            No local token activity found for this year.
                          </div>
                        ) : (
                          <div className="overflow-x-auto">
                            <div
                              className="relative mx-auto w-max min-w-fit"
                              onMouseLeave={() => setHoveredHeatmapCell(null)}
                            >
                              <div
                                className="grid gap-x-4 gap-y-4"
                                style={{ gridTemplateColumns: `${HEATMAP_DAY_LABEL_WIDTH}px max-content` }}
                              >
                                <div />
                                <div
                                  className="relative h-7 text-sm text-muted-foreground"
                                  style={{ width: heatmapGridWidth }}
                                >
                                  {heatmapMonthLabels.map((month) => (
                                    <div
                                      key={month.label}
                                      className="pointer-events-none absolute top-0 whitespace-nowrap"
                                      style={{ left: month.offset }}
                                    >
                                      {month.label}
                                    </div>
                                  ))}
                                </div>

                                <div className="relative h-[106px] text-sm text-muted-foreground">
                                  {heatmapDayLabels.map((day) => (
                                    <div
                                      key={day.label}
                                      className="absolute left-0 -translate-y-1/2"
                                      style={{ top: `${day.row * 18}px` }}
                                    >
                                      {day.label}
                                    </div>
                                  ))}
                                </div>

                                <div
                                  className="grid gap-[5px]"
                                  style={{
                                    gridTemplateColumns: `repeat(${heatmapWeeks.length}, ${HEATMAP_CELL_SIZE}px)`,
                                  }}
                                >
                                  {heatmapWeeks.map((week, weekIndex) => (
                                    <div key={`week-${weekIndex}`} className="grid gap-[5px]">
                                      {week.cells.map((cell, dayIndex) =>
                                        cell.count === null ? (
                                          <div
                                            key={cell.date}
                                            className="size-[12px] rounded-[3px] border border-border/50"
                                            style={{ backgroundColor: heatmapColor(cell.level, heatmapPalette) }}
                                          />
                                        ) : (
                                          <button
                                            key={cell.date}
                                            type="button"
                                            className="size-[12px] rounded-[3px] border border-border/50 outline-none transition-transform hover:scale-110 focus-visible:ring-2 focus-visible:ring-ring"
                                            style={{ backgroundColor: heatmapColor(cell.level, heatmapPalette) }}
                                            aria-label={formatHeatmapAriaLabel(cell)}
                                            onMouseEnter={(event) =>
                                              setHoveredHeatmapCell({
                                                cell,
                                                weekIndex,
                                                dayIndex,
                                                anchorRect: getAnchorRect(event.currentTarget),
                                              })
                                            }
                                            onFocus={(event) =>
                                              setHoveredHeatmapCell({
                                                cell,
                                                weekIndex,
                                                dayIndex,
                                                anchorRect: getAnchorRect(event.currentTarget),
                                              })
                                            }
                                          />
                                        ),
                                      )}
                                    </div>
                                  ))}
                                </div>

                                <div />
                                <div className="flex items-center justify-end gap-2 pt-2 text-sm text-muted-foreground">
                                  <span>Less</span>
                                  {([0, 1, 2, 3, 4] as const).map((level) => (
                                    <span
                                      key={level}
                                      className="size-[14px] rounded-[4px] border border-border/50"
                                      style={{ backgroundColor: heatmapColor(level, heatmapPalette) }}
                                    />
                                  ))}
                                  <span>More</span>
                                </div>
                              </div>

                              <HeatmapHoverPopover
                                hoveredCell={hoveredHeatmapCell}
                                position={heatmapPopoverPosition}
                              />
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="flex h-full rounded-[22px] border border-border/70 bg-background/82 p-4 sm:p-6">
                        {showInitialSkeleton || showDeferredChartSkeleton ? (
                          <ChartSkeleton />
                        ) : yearlyAgentShares.length > 0 ? (
                          <ChartContainer
                            config={heatmapAgentRadarChartConfig}
                            className="h-full min-h-0 w-full"
                          >
                            <ResponsiveContainer width="100%" height="100%">
                              <RadarChart data={yearlyAgentShares} outerRadius="68%">
                                <PolarGrid className="stroke-border/50" />
                                <PolarAngleAxis
                                  dataKey="label"
                                  tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                                />
                                <PolarRadiusAxis
                                  angle={90}
                                  domain={[0, yearlyAgentRadarMax]}
                                  tick={false}
                                  axisLine={false}
                                />
                                <ChartTooltip
                                  cursor={false}
                                  content={
                                    <RadarShareTooltipContent />
                                  }
                                />
                                <Radar
                                  dataKey="sharePercent"
                                  name="Share"
                                  stroke="var(--color-chart-2)"
                                  fill="var(--color-chart-2)"
                                  fillOpacity={0.26}
                                  strokeWidth={2.25}
                                />
                              </RadarChart>
                            </ResponsiveContainer>
                          </ChartContainer>
                        ) : (
                          <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-border/60 bg-background/35 text-sm text-muted-foreground">
                            No agent activity found for this year.
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </section>

              <section className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                  <div className="text-[11px] tracking-[0.08em] text-muted-foreground">
                    Chart resolution
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Switch between daily and monthly aggregation for the all-time charts below.
                  </div>
                </div>

                <Tabs
                  value={resolution}
                  onValueChange={(value) => {
                    if (value === "day" || value === "month") {
                      setResolution(value);
                    }
                  }}
                >
                  <TabsList className="border border-border/70 bg-background/70 p-1">
                    <TabsTrigger value="month" className="px-4">
                      By month
                    </TabsTrigger>
                    <TabsTrigger value="day" className="px-4">
                      By day
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              </section>

              <section className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
                <Card className="border-border/70 bg-card/88 shadow-none backdrop-blur">
                  <CardHeader className="pb-2">
                    <CardDescription className="text-[11px] tracking-[0.08em] text-muted-foreground">
                      Trend
                    </CardDescription>
                    <CardTitle className="text-xl">
                      Token curve by {resolution === "month" ? "month" : "day"}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-2">
                    {showInitialSkeleton || showDeferredChartSkeleton ? (
                      <ChartSkeleton />
                    ) : (
                      <ChartContainer config={curveChartConfig} className="h-[320px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={timelineSeries} margin={{ left: 4, right: 8, top: 8, bottom: 0 }}>
                            <defs>
                              <linearGradient id="token-curve-fill" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="var(--color-chart-1)" stopOpacity={0.36} />
                                <stop offset="95%" stopColor="var(--color-chart-1)" stopOpacity={0.03} />
                              </linearGradient>
                            </defs>
                            <CartesianGrid vertical={false} />
                            <XAxis
                              dataKey="label"
                              axisLine={false}
                              tickLine={false}
                              tickMargin={10}
                              minTickGap={resolution === "day" ? 28 : 12}
                            />
                            <YAxis
                              axisLine={false}
                              tickLine={false}
                              tickFormatter={(value) => formatAxisTokens(Number(value))}
                              width={46}
                            />
                            <ChartTooltip
                              cursor={false}
                              content={
                                <ChartTooltipContent
                                  formatter={(value, name) =>
                                    name === "Messages"
                                      ? `${Number(value).toLocaleString()}`
                                      : formatTooltipTokens(Number(value))
                                  }
                                />
                              }
                            />
                            <ChartLegend content={<ChartLegendContent />} />
                            <Area
                              type="monotone"
                              dataKey="tokens"
                              stroke="var(--color-chart-1)"
                              strokeWidth={2.5}
                              fill="url(#token-curve-fill)"
                            />
                            <Area
                              type="monotone"
                              dataKey="messages"
                              stroke="var(--color-chart-3)"
                              strokeDasharray="4 4"
                              strokeWidth={2}
                              fillOpacity={0}
                            />
                          </AreaChart>
                        </ResponsiveContainer>
                      </ChartContainer>
                    )}
                  </CardContent>
                </Card>

                <Card className="border-border/70 bg-card/88 shadow-none backdrop-blur">
                  <CardHeader className="pb-2">
                    <CardDescription className="text-[11px] tracking-[0.08em] text-muted-foreground">
                      Sources
                    </CardDescription>
                    <CardTitle className="text-xl">
                      Agent distribution by {resolution === "month" ? "month" : "day"}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-2">
                    {showInitialSkeleton || showDeferredChartSkeleton ? (
                      <ChartSkeleton />
                    ) : (
                      <ChartContainer config={agentChartConfig} className="h-[320px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={agentSeries.data} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
                            <CartesianGrid vertical={false} />
                            <XAxis
                              dataKey="label"
                              axisLine={false}
                              tickLine={false}
                              tickMargin={10}
                              minTickGap={resolution === "day" ? 28 : 12}
                            />
                            <YAxis
                              axisLine={false}
                              tickLine={false}
                              tickFormatter={(value) => formatAxisTokens(Number(value))}
                              width={46}
                            />
                            <ChartTooltip
                              cursor={false}
                              content={
                                <ChartTooltipContent
                                  formatter={(value) => formatTooltipTokens(Number(value))}
                                />
                              }
                            />
                            <ChartLegend content={<ChartLegendContent />} />
                            {agentSeries.keys.map((key, index) => (
                              <Bar
                                key={key}
                                dataKey={key}
                                stackId="agents"
                                fill={agentPalette[index % agentPalette.length]}
                                radius={index === agentSeries.keys.length - 1 ? [6, 6, 0, 0] : [0, 0, 0, 0]}
                              />
                            ))}
                          </BarChart>
                        </ResponsiveContainer>
                      </ChartContainer>
                    )}
                  </CardContent>
                </Card>
              </section>

              <section>
                <Card className="border-border/70 bg-card/88 shadow-none backdrop-blur">
                  <CardHeader className="pb-2">
                    <CardDescription className="text-[11px] tracking-[0.08em] text-muted-foreground">
                      Shape
                    </CardDescription>
                    <CardTitle className="text-xl">
                      Token mix by {resolution === "month" ? "month" : "day"}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-2">
                    {showInitialSkeleton || showDeferredChartSkeleton ? (
                      <ChartSkeleton />
                    ) : (
                      <ChartContainer config={tokenMixChartConfig} className="h-[320px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={timelineSeries} margin={{ left: 4, right: 8, top: 8, bottom: 0 }}>
                            <CartesianGrid vertical={false} />
                            <XAxis
                              dataKey="label"
                              axisLine={false}
                              tickLine={false}
                              tickMargin={10}
                              minTickGap={resolution === "day" ? 28 : 12}
                            />
                            <YAxis
                              axisLine={false}
                              tickLine={false}
                              tickFormatter={(value) => formatAxisTokens(Number(value))}
                              width={46}
                            />
                            <ChartTooltip
                              cursor={false}
                              content={
                                <ChartTooltipContent
                                  formatter={(value) => formatTooltipTokens(Number(value))}
                                />
                              }
                            />
                            <ChartLegend content={<ChartLegendContent />} />
                            <Area
                              type="monotone"
                              dataKey="input"
                              stackId="mix"
                              stroke="var(--color-chart-1)"
                              fill="var(--color-chart-1)"
                              fillOpacity={0.85}
                            />
                            <Area
                              type="monotone"
                              dataKey="output"
                              stackId="mix"
                              stroke="var(--color-chart-2)"
                              fill="var(--color-chart-2)"
                              fillOpacity={0.82}
                            />
                            <Area
                              type="monotone"
                              dataKey="cache"
                              stackId="mix"
                              stroke="var(--color-chart-3)"
                              fill="var(--color-chart-3)"
                              fillOpacity={0.8}
                            />
                            <Area
                              type="monotone"
                              dataKey="reasoning"
                              stackId="mix"
                              stroke="var(--color-chart-4)"
                              fill="var(--color-chart-4)"
                              fillOpacity={0.75}
                            />
                          </AreaChart>
                        </ResponsiveContainer>
                      </ChartContainer>
                    )}
                  </CardContent>
                </Card>
              </section>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function HeatmapSkeleton() {
  return (
    <div className="overflow-x-auto">
      <div className="mx-auto w-max min-w-fit">
        <div
          className="grid gap-x-4 gap-y-4"
          style={{ gridTemplateColumns: `${HEATMAP_DAY_LABEL_WIDTH}px max-content` }}
        >
          <div />
          <div className="flex h-7 items-start gap-8">
            {Array.from({ length: 8 }, (_, index) => (
              <Skeleton key={`month-skeleton-${index}`} className="h-4 w-8 rounded-sm" />
            ))}
          </div>

          <div className="flex h-[106px] flex-col justify-around py-[2px]">
            {Array.from({ length: 3 }, (_, index) => (
              <Skeleton key={`day-label-skeleton-${index}`} className="h-4 w-9 rounded-sm" />
            ))}
          </div>

          <div className="grid gap-[5px]" style={{ gridTemplateColumns: "repeat(53, 12px)" }}>
            {Array.from({ length: 53 }, (_, weekIndex) => (
              <div key={`heatmap-week-skeleton-${weekIndex}`} className="grid gap-[5px]">
                {Array.from({ length: 7 }, (_, dayIndex) => (
                  <Skeleton
                    key={`heatmap-cell-skeleton-${weekIndex}-${dayIndex}`}
                    className="size-[12px] rounded-[3px]"
                  />
                ))}
              </div>
            ))}
          </div>

          <div />
          <div className="flex items-center justify-end gap-2 pt-2">
            <Skeleton className="h-4 w-8 rounded-sm" />
            {Array.from({ length: 5 }, (_, index) => (
              <Skeleton key={`legend-skeleton-${index}`} className="size-[14px] rounded-[4px]" />
            ))}
            <Skeleton className="h-4 w-8 rounded-sm" />
          </div>
        </div>
      </div>
    </div>
  );
}

function ChartSkeleton() {
  return (
    <div className="h-[320px] w-full rounded-[18px] border border-border/50 bg-background/35 p-4">
      <div className="flex h-full gap-4">
        <div className="flex w-10 flex-col justify-between py-2">
          {Array.from({ length: 5 }, (_, index) => (
            <Skeleton key={`chart-axis-${index}`} className="h-3 w-8 rounded-sm" />
          ))}
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex-1 space-y-5 py-2">
            {Array.from({ length: 5 }, (_, index) => (
              <Skeleton key={`chart-line-${index}`} className="h-px w-full rounded-sm" />
            ))}
          </div>
          <div className="mt-3 flex items-center justify-between gap-3">
            {Array.from({ length: 6 }, (_, index) => (
              <Skeleton key={`chart-tick-${index}`} className="h-3 w-10 rounded-sm" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function HeatmapHoverPopover({
  hoveredCell,
  position,
}: {
  hoveredCell: HeatmapHoverState | null;
  position: { x: number; y: number } | null;
}) {
  if (!hoveredCell || !position || !hoveredCell.cell.detail) {
    return null;
  }

  const { cell } = hoveredCell;
  const detail = cell.detail;
  if (!detail) {
    return null;
  }

  return createPortal(
    <div
      className="pointer-events-none fixed top-0 left-0 z-[140] transition-[transform,opacity] duration-200 ease-out"
      style={{
        transform: `translate3d(${position.x}px, ${position.y}px, 0)`,
        opacity: 1,
      }}
    >
      <div className="w-60 rounded-xl border border-background/12 bg-foreground p-3 text-background shadow-xl">
        <div className="space-y-2 text-xs">
          <div className="font-medium text-background">{formatHeatmapDate(cell.date)}</div>
          <HeatmapPopoverRow label="Tokens" value={cell.count ?? 0} />
          <HeatmapPopoverRow label="Messages" value={detail.message_count} />
          <div className="h-px bg-background/18" />
          <HeatmapPopoverRow label="Input" value={detail.breakdown.input_tokens} />
          <HeatmapPopoverRow label="Output" value={detail.breakdown.output_tokens} />
          <HeatmapPopoverRow
            label="Cache"
            value={
              detail.breakdown.cache_read_tokens + detail.breakdown.cache_write_tokens
            }
          />
          <HeatmapPopoverRow label="Reasoning" value={detail.breakdown.reasoning_tokens} />
        </div>
      </div>
    </div>,
    document.body,
  );
}

function HeatmapPopoverRow({ label, value }: { label: string; value: number }) {
  const displayValue = formatDetailedNumber(value);

  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-background/65">{label}</span>
      <TextScramble
        key={`${label}-${displayValue}`}
        as="span"
        duration={0.42}
        speed={0.022}
        className="text-background tabular-nums"
      >
        {displayValue}
      </TextScramble>
    </div>
  );
}

function RadarShareTooltipContent({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{
    color?: string;
    value?: number | string;
    payload?: { label?: string };
  }>;
}) {
  const item = payload?.[0];
  if (!active || !item) {
    return null;
  }

  const agentLabel = item.payload?.label ?? "Agent";
  const color = item.color ?? "var(--color-chart-2)";
  const rawValue = typeof item.value === "number" ? item.value : Number(item.value ?? 0);

  return (
    <div className="min-w-44 rounded-xl border border-border/70 bg-popover/95 px-3 py-2.5 text-popover-foreground shadow-xl backdrop-blur">
      <div className="mb-2 text-[11px] font-medium tracking-[0.08em] text-muted-foreground">
        Share
      </div>
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <span className="size-2.5 rounded-full" style={{ backgroundColor: color }} />
          <span className="text-xs text-muted-foreground">{agentLabel}</span>
        </div>
        <div className="text-sm font-semibold tabular-nums">
          {formatPercent(rawValue / 100)}
        </div>
      </div>
    </div>
  );
}

function buildTimelineSeries(
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

function buildAgentSeries(
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

function buildHeatmapWeeks(days: DailyTokenUsageResponse[], year: string): HeatmapWeek[] {
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

function buildHeatmapMonthLabels(weeks: HeatmapWeek[], year: string): HeatmapMonthLabel[] {
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

function calculateHeatmapPopoverPosition(anchorRect: HeatmapHoverState["anchorRect"]) {
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

function getAnchorRect(target: HTMLElement) {
  const rect = target.getBoundingClientRect();
  return {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
  };
}

function summarizeYear(days: DailyTokenUsageResponse[], year: string): YearBreakdownSummary {
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

function buildYearAgentShares(days: DailyTokenUsageResponse[], year: string): YearAgentShare[] {
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

function calculateYearAgentRadarMax(data: YearAgentShare[]) {
  const maxShare = Math.max(...data.map((item) => item.sharePercent), 0);
  if (maxShare <= 0) {
    return 100;
  }

  return Math.max(20, Math.ceil((maxShare * 1.15) / 5) * 5);
}

function mergeYearLists(
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

function heatmapColor(
  level: 0 | 1 | 2 | 3 | 4,
  palette: readonly [string, string, string, string, string],
) {
  return palette[level];
}

function formatHeatmapDate(value: string) {
  return format(parseISO(value), "EEE, MMM d, yyyy");
}

function formatHeatmapAriaLabel(cell: HeatmapCell) {
  return `${formatHeatmapDate(cell.date)}: ${formatDetailedNumber(cell.count ?? 0)} tokens, ${formatDetailedNumber(cell.detail?.message_count ?? 0)} messages`;
}

function formatDetailedNumber(value: number) {
  return value.toLocaleString();
}

function formatPercent(value: number) {
  return new Intl.NumberFormat("en", {
    style: "percent",
    maximumFractionDigits: value >= 0.1 ? 0 : 1,
  }).format(value);
}

function sortDailyUsage(days: DailyTokenUsageResponse[]) {
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

function formatCompactNumber(value: number) {
  return new Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: value >= 1_000_000 ? 1 : 0,
  }).format(value);
}

function formatCurrencyCompact(value: number | null) {
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

function formatAxisTokens(value: number) {
  if (value >= 1_000_000) {
    return `${Math.round(value / 1_000_000)}M`;
  }
  if (value >= 1_000) {
    return `${Math.round(value / 1_000)}k`;
  }
  return `${Math.round(value)}`;
}

function formatTooltipTokens(value: number) {
  return `${value.toLocaleString()} tokens`;
}

function formatGeneratedAt(value: number) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value * 1000));
}

function humanizeId(value: string) {
  return value
    .split(/[-_]/g)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}
