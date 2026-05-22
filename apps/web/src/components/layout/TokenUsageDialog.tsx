"use client";

import * as React from "react";
import { Activity, ChartColumnBig } from "lucide-react";
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
  cn,
} from "@workspace/ui";

import {
  tokenUsageApi,
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
import { useDesktopTrafficLightsPadding } from "@/hooks/use-desktop-traffic-lights-padding";
import { useTheme } from "next-themes";
import {
  ChartSkeleton,
  HeatmapHoverPopover,
  HeatmapSkeleton,
  RadarShareTooltipContent,
  TokenUsageDialogHeader,
  TokenUsageStatCards,
} from "@/components/layout/token-usage-dialog-parts";
import {
  HEATMAP_CELL_SIZE,
  HEATMAP_DAY_LABEL_WIDTH,
  HEATMAP_GAP,
  agentPalette,
  buildAgentSeries,
  buildHeatmapMonthLabels,
  buildHeatmapWeeks,
  buildTimelineSeries,
  buildYearAgentShares,
  calculateHeatmapPopoverPosition,
  calculateYearAgentRadarMax,
  curveChartConfig,
  darkHeatmapPalette,
  formatAxisTokens,
  formatCompactNumber,
  formatGeneratedAt,
  formatHeatmapAriaLabel,
  formatTooltipTokens,
  getAnchorRect,
  heatmapAgentRadarChartConfig,
  heatmapColor,
  heatmapDayLabels,
  humanizeId,
  lightHeatmapPalette,
  mergeYearLists,
  sortDailyUsage,
  summarizeYear,
  tokenMixChartConfig,
  type HeatmapHoverState,
  type Resolution,
} from "@/components/layout/token-usage-dialog-utils";

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
  const needsTrafficLightsPadding = useDesktopTrafficLightsPadding();
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
        className={cn(
          "top-1/2 left-1/2 h-[100dvh] w-[100vw] max-w-[100vw] translate-x-[-50%] translate-y-[-50%] gap-0 overflow-hidden rounded-none border-0 p-0 sm:h-[calc(100dvh-2rem)] sm:w-[calc(100vw-2rem)] sm:max-w-[calc(100vw-2rem)] sm:rounded-[28px] sm:border sm:border-border/70",
          needsTrafficLightsPadding &&
            "top-[32px] h-[calc(100dvh-32px)] translate-y-0 sm:top-[32px] sm:h-[calc(100dvh-3rem)]"
        )}
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
          <TokenUsageDialogHeader
            generatedAtLabel={generatedAtLabel}
            loading={loading}
            overview={overview}
            refreshing={refreshing}
            onClose={() => setOpen(false)}
            onRefresh={handleRefresh}
          />

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

              <TokenUsageStatCards
                overview={overview}
                rangeLabel={rangeLabel}
                showInitialSkeleton={showInitialSkeleton}
              />

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
