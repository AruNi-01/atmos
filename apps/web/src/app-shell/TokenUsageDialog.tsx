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

import type { TokenUsageOverviewResponse } from "@/api/ws/token-usage-api";
import { tokenUsageApi } from "@/api/ws/token-usage-api";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/shared/components/ui/chart";
import { useDesktopTrafficLightsPadding } from "@/shared/hooks/use-desktop-traffic-lights-padding";
import { useTokenUsageQuery } from "@/features/usage/hooks/use-token-usage-query";
import { useQueryClient } from "@tanstack/react-query";
import { useComputerQueryScope } from "@/api/query/query-scope";
import { queryKeys } from "@/api/query/query-keys";
import { useLocale, useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import {
  ChartSkeleton,
  HeatmapHoverPopover,
  HeatmapSkeleton,
  RadarShareTooltipContent,
  TokenUsageDialogHeader,
  TokenUsageStatCards,
} from "@/app-shell/token-usage-dialog-parts";
import {
  HEATMAP_CELL_SIZE,
  HEATMAP_DAY_LABEL_WIDTH,
  HEATMAP_GAP,
  agentPalette,
  buildAgentSeries,
  buildCurveChartConfig,
  buildHeatmapAgentRadarChartConfig,
  buildHeatmapDayLabels,
  buildHeatmapMonthLabels,
  buildHeatmapWeeks,
  buildTimelineSeries,
  buildTokenMixChartConfig,
  buildYearAgentShares,
  calculateHeatmapPopoverPosition,
  calculateYearAgentRadarMax,
  darkHeatmapPalette,
  formatAxisTokens,
  formatCompactNumber,
  formatDetailedNumber,
  formatGeneratedAt,
  formatHeatmapAriaLabel,
  formatTooltipTokens,
  getAnchorRect,
  heatmapColor,
  humanizeId,
  lightHeatmapPalette,
  mergeYearLists,
  sortDailyUsage,
  summarizeYear,
  type HeatmapHoverState,
  type Resolution,
} from "@/app-shell/token-usage-dialog-utils";

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
        if (!nextOpen) {
          setSelectedYear("");
        }
      }
      onOpenChange?.(nextOpen);
    },
    [onOpenChange, openProp],
  );
  const [selectedYear, setSelectedYear] = React.useState("");
  const [resolution, setResolution] = React.useState<Resolution>("month");
  const [hoveredHeatmapCell, setHoveredHeatmapCell] = React.useState<HeatmapHoverState | null>(null);
  const [chartsReady, setChartsReady] = React.useState(false);
  const queryClient = useQueryClient();
  const scope = useComputerQueryScope();
  const t = useTranslations("appShell.tokenUsageDialog");
  const locale = useLocale();
  const tokenUsageQuery = useTokenUsageQuery(
    { year: selectedYear || null },
    { enabled: open },
  );
  const overview: TokenUsageOverviewResponse | null = open ? (tokenUsageQuery.data ?? null) : null;
  const loading = open && tokenUsageQuery.isLoading && !tokenUsageQuery.data;
  const refreshing = open && tokenUsageQuery.isFetching && !!tokenUsageQuery.data;
  const error = open && tokenUsageQuery.isError
    ? (tokenUsageQuery.error instanceof Error
        ? tokenUsageQuery.error.message
        : t("errors.loadOverviewFallback"))
    : null;
  const { resolvedTheme } = useTheme();
  const needsTrafficLightsPadding = useDesktopTrafficLightsPadding();
  const isDarkTheme = resolvedTheme !== "light";
  const heatmapPalette = isDarkTheme ? darkHeatmapPalette : lightHeatmapPalette;
  const curveChartConfig = React.useMemo(
    () =>
      buildCurveChartConfig({
        tokens: t("charts.curve.tokens"),
        messages: t("charts.curve.messages"),
      }),
    [t],
  );
  const tokenMixChartConfig = React.useMemo(
    () =>
      buildTokenMixChartConfig({
        input: t("charts.mix.input"),
        output: t("charts.mix.output"),
        cache: t("charts.mix.cache"),
        reasoning: t("charts.mix.reasoning"),
      }),
    [t],
  );
  const heatmapAgentRadarChartConfig = React.useMemo(
    () =>
      buildHeatmapAgentRadarChartConfig({
        share: t("charts.radar.share"),
      }),
    [t],
  );
  const heatmapDayLabels = React.useMemo(
    () =>
      buildHeatmapDayLabels({
        mon: t("heatmap.days.mon"),
        wed: t("heatmap.days.wed"),
        fri: t("heatmap.days.fri"),
      }),
    [t],
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

  // Auto-select the latest available year once the first data arrives.
  React.useEffect(() => {
    if (selectedYear || !overview) {
      return;
    }

    const latestYear = availableYears[availableYears.length - 1];
    if (latestYear) {
      setSelectedYear(latestYear);
    }
  }, [availableYears, overview, selectedYear]);

  // Reset chartsReady when dialog closes or new data first arrives.
  React.useEffect(() => {
    if (!open) {
      setChartsReady(false);
      return;
    }
  }, [open]);

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

  const heatmapYear = selectedYear || availableYears[availableYears.length - 1] || "";

  React.useEffect(() => {
    setHoveredHeatmapCell(null);
  }, [heatmapYear, overview?.generated_at]);

  const timelineSeries = React.useMemo(
    () => buildTimelineSeries(sortedDays, resolution, locale),
    [locale, resolution, sortedDays],
  );

  const heatmapWeeks = React.useMemo(
    () => buildHeatmapWeeks(sortedDays, heatmapYear),
    [heatmapYear, sortedDays],
  );
  const heatmapMonthLabels = React.useMemo(
    () => buildHeatmapMonthLabels(heatmapWeeks, heatmapYear, locale),
    [heatmapWeeks, heatmapYear, locale],
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
    () => buildAgentSeries(sortedDays, resolution, locale),
    [locale, resolution, sortedDays],
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
            label: key === "other" ? t("charts.agent.other") : humanizeId(key),
            color: agentPalette[index % agentPalette.length],
          },
        ]),
      ) satisfies ChartConfig,
    [agentSeries.keys, t],
  );
  const generatedAtLabel = overview
    ? formatGeneratedAt(overview.generated_at, locale)
    : t("header.generatedAt.notLoaded");
  const rangeLabel =
    overview?.summary.range_start && overview.summary.range_end
      ? t("range.withBounds", {
          start: overview.summary.range_start,
          end: overview.summary.range_end,
        })
      : t("range.empty");
  const resolutionLabel =
    resolution === "month" ? t("resolution.options.month") : t("resolution.options.day");

  const handleRefresh = React.useCallback(() => {
    void (async () => {
      const next = await tokenUsageApi.getOverview({
        refresh: true,
        year: selectedYear || null,
      });
      queryClient.setQueryData(
        queryKeys.computer.tokenUsageOverview(scope, {
          year: selectedYear || null,
          since: null,
          until: null,
          clients: null,
          groupBy: null,
        }),
        next,
      );
    })();
  }, [queryClient, scope, selectedYear]);

  const showInitialSkeleton = loading && !overview;
  const showDeferredChartSkeleton = !showInitialSkeleton && !!overview && !chartsReady;
  const emptyState = !loading && !error && !!overview && heatmapSummary.activeDays === 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!hideTrigger ? (
        <DialogTrigger asChild>
          <button
            aria-label={t("trigger.label")}
            className="size-8 flex items-center justify-center rounded-md text-muted-foreground transition-colors duration-200 ease-out hover:bg-accent hover:text-accent-foreground"
            title={t("trigger.title")}
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
          <DialogTitle>{t("dialog.title")}</DialogTitle>
          <DialogDescription>{t("dialog.description")}</DialogDescription>
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
                      <div className="text-sm font-medium">{t("errors.loadOverviewTitle")}</div>
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
                          {t("heatmap.kicker")}
                        </CardDescription>
                        <CardTitle className="text-2xl font-semibold tracking-tight">
                          {showInitialSkeleton
                            ? t("heatmap.loadingTitle")
                            : t("heatmap.title", {
                                tokens: formatCompactNumber(heatmapSummary.totalTokens, locale),
                                year: heatmapYear || t("heatmap.selectedYearFallback"),
                              })}
                        </CardTitle>
                        <p className="text-sm text-muted-foreground">
                          {showInitialSkeleton
                            ? t("heatmap.loadingDescription")
                            : t("heatmap.summary", {
                                activeDays: formatCompactNumber(heatmapSummary.activeDays, locale),
                                messages: formatCompactNumber(heatmapSummary.totalMessages, locale),
                              })}
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
                              <SelectValue placeholder={t("heatmap.selectYearPlaceholder")} />
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
                            {t("heatmap.empty")}
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
                                            aria-label={formatHeatmapAriaLabel(
                                              cell,
                                              locale,
                                              ({ date, tokens, messages }) =>
                                                t("heatmap.ariaLabel", { date, tokens, messages }),
                                            )}
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
                                  <span>{t("heatmap.legend.less")}</span>
                                  {([0, 1, 2, 3, 4] as const).map((level) => (
                                    <span
                                      key={level}
                                      className="size-[14px] rounded-[4px] border border-border/50"
                                      style={{ backgroundColor: heatmapColor(level, heatmapPalette) }}
                                    />
                                  ))}
                                  <span>{t("heatmap.legend.more")}</span>
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
                                  name={heatmapAgentRadarChartConfig.share.label}
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
                            {t("heatmap.agentShareEmpty")}
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
                    {t("resolution.kicker")}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {t("resolution.description")}
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
                      {t("resolution.options.month")}
                    </TabsTrigger>
                    <TabsTrigger value="day" className="px-4">
                      {t("resolution.options.day")}
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              </section>

              <section className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
                <Card className="border-border/70 bg-card/88 shadow-none backdrop-blur">
                  <CardHeader className="pb-2">
                    <CardDescription className="text-[11px] tracking-[0.08em] text-muted-foreground">
                      {t("trend.kicker")}
                    </CardDescription>
                    <CardTitle className="text-xl">
                      {t("trend.title", { resolution: resolutionLabel })}
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
                              tickFormatter={(value) => formatAxisTokens(Number(value), locale)}
                              width={46}
                            />
                            <ChartTooltip
                              cursor={false}
                              content={
                                <ChartTooltipContent
                                  formatter={(value, name) =>
                                    name === curveChartConfig.messages.label
                                      ? formatDetailedNumber(Number(value), locale)
                                      : formatTooltipTokens(Number(value), locale, ({ value }) =>
                                          t("tooltip.tokens", { value }),
                                        )
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
                      {t("sources.kicker")}
                    </CardDescription>
                    <CardTitle className="text-xl">
                      {t("sources.title", { resolution: resolutionLabel })}
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
                              tickFormatter={(value) => formatAxisTokens(Number(value), locale)}
                              width={46}
                            />
                            <ChartTooltip
                              cursor={false}
                              content={
                                <ChartTooltipContent
                                  formatter={(value) =>
                                    formatTooltipTokens(Number(value), locale, ({ value: displayValue }) =>
                                      t("tooltip.tokens", { value: displayValue }),
                                    )
                                  }
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
                      {t("shape.kicker")}
                    </CardDescription>
                    <CardTitle className="text-xl">
                      {t("shape.title", { resolution: resolutionLabel })}
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
                              tickFormatter={(value) => formatAxisTokens(Number(value), locale)}
                              width={46}
                            />
                            <ChartTooltip
                              cursor={false}
                              content={
                                <ChartTooltipContent
                                  formatter={(value) =>
                                    formatTooltipTokens(Number(value), locale, ({ value: displayValue }) =>
                                      t("tooltip.tokens", { value: displayValue }),
                                    )
                                  }
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
