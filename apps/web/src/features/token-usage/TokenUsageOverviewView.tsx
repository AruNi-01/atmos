"use client";

import * as React from "react";
import { Bot, BrainCircuit, Coins, DollarSign } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import {
  IconSwap,
  IconSwapItem,
  cn,
  compactSlidingParts,
  currencySlidingParts,
  type DitherHeatmapCell,
  type DitherTheme,
  type DitherTooltipSliding,
  type DitherTooltipState,
} from "@workspace/ui";
import { useLocale, useTranslations } from "next-intl";
import { useTheme } from "next-themes";

import type { TokenUsageOverviewResponse } from "@/api/ws/token-usage-api";
import {
  assignAgentChartColors,
  buildBreakdownSeries,
  buildHeatmapMonthLabels,
  buildHeatmapWeekdayAxisLabels,
  buildHeatmapWeeks,
  buildModelProviderMap,
  buildOverviewBreakdownShares,
  buildTimelineSeries,
  buildYearBreakdownShares,
  formatDimensionLabel,
  formatMetricValue,
  mergeYearLists,
  sortDailyUsage,
  summarizeTokenMix,
  summarizeYear,
  tokenMixSlices,
  type Resolution,
  type UsageDimension,
  type UsageMetric,
} from "@/features/token-usage/token-usage-dialog-utils";
import {
  TokenUsageAgentIcon,
  TokenUsageModelIcon,
} from "@/features/token-usage/TokenUsageIcons";
import { TokenUsageOverviewTab } from "@/features/token-usage/TokenUsageOverviewTab";
import {
  inflateSharePayload,
  type TokenUsageSharePayload,
} from "@/features/token-usage/token-usage-share-payload";

const CYCLE_EASE = [0.22, 1, 0.36, 1] as const;
const CYCLE_TRANSITION = { duration: 0.2, ease: CYCLE_EASE } as const;

function TokenUsageCycleButton({
  value,
  options,
  onValueChange,
  className,
}: {
  value: string;
  options: ReadonlyArray<{
    id: string;
    label: string;
    icon: React.ReactNode;
  }>;
  onValueChange: (next: string) => void;
  className?: string;
}) {
  const index = Math.max(
    0,
    options.findIndex((item) => item.id === value),
  );
  const active = options[index] ?? options[0];
  if (!active) return null;
  const next = options[(index + 1) % options.length] ?? active;

  return (
    <button
      type="button"
      aria-label={active.label}
      className={cn(
        "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium leading-none text-foreground",
        "border-0 bg-transparent shadow-none hover:bg-primary/5 active:scale-[0.98]",
        className,
      )}
      onClick={() => {
        if (next.id !== active.id) onValueChange(next.id);
      }}
    >
      <span className="inline-flex size-4 shrink-0 items-center justify-center">
        <IconSwap>
          <IconSwapItem key={active.id}>{active.icon}</IconSwapItem>
        </IconSwap>
      </span>
      <span className="relative inline-grid overflow-hidden leading-none">
        <span className="invisible col-start-1 row-start-1 whitespace-nowrap" aria-hidden>
          {options.reduce(
            (longest, item) =>
              item.label.length > longest.length ? item.label : longest,
            "",
          )}
        </span>
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={active.id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={CYCLE_TRANSITION}
            className="col-start-1 row-start-1 whitespace-nowrap"
          >
            {active.label}
          </motion.span>
        </AnimatePresence>
      </span>
    </button>
  );
}

export function TokenUsageOverviewView({
  overview: localOverview,
  payload,
  loading = false,
  toolbarEnd,
  captureTargetRef,
  hideCostToggle = false,
}: {
  overview?: TokenUsageOverviewResponse | null;
  payload?: TokenUsageSharePayload | null;
  loading?: boolean;
  toolbarEnd?: React.ReactNode;
  captureTargetRef?: React.Ref<HTMLDivElement>;
  hideCostToggle?: boolean;
}) {
  const [selectedYear, setSelectedYear] = React.useState("");
  const [resolution, setResolution] = React.useState<Resolution>("month");
  const [metric, setMetric] = React.useState<UsageMetric>("tokens");
  const [dimension, setDimension] = React.useState<UsageDimension>("agent");
  const [heatmapTooltip, setHeatmapTooltip] =
    React.useState<DitherTooltipState | null>(null);
  const t = useTranslations("appShell.tokenUsageDialog");
  const locale = useLocale();
  const { resolvedTheme } = useTheme();
  const ditherTheme: DitherTheme = resolvedTheme === "light" ? "light" : "dark";
  const isDark = ditherTheme === "dark";

  const overview = React.useMemo(() => {
    if (payload) return inflateSharePayload(payload, dimension);
    return localOverview ?? null;
  }, [dimension, localOverview, payload]);

  const uniqueModelCount = payload
    ? payload.summary.model_count
    : overview?.by_model
      ? new Set(overview.by_model.map((row) => row.model_id.trim() || "unknown"))
          .size
      : 0;

  const metricCycleOptions = React.useMemo(() => {
    const tokens = {
      id: "tokens",
      label: t("metric.tokens"),
      icon: <Coins className="size-4" aria-hidden />,
    };
    if (hideCostToggle || (payload && payload.summary.total_cost_usd == null)) {
      return [tokens];
    }
    return [
      tokens,
      {
        id: "cost",
        label: t("metric.cost"),
        icon: <DollarSign className="size-4" aria-hidden />,
      },
    ];
  }, [hideCostToggle, payload, t]);

  const dimensionCycleOptions = React.useMemo(
    () => [
      {
        id: "agent",
        label: t("dimension.agent"),
        icon: <Bot className="size-4" aria-hidden />,
      },
      {
        id: "model",
        label: t("dimension.model"),
        icon: <BrainCircuit className="size-4" aria-hidden />,
      },
    ],
    [t],
  );

  const sortedDays = React.useMemo(
    () => sortDailyUsage(overview?.by_day ?? []),
    [overview?.by_day],
  );
  const availableYears = React.useMemo(
    () => mergeYearLists(overview?.available_years ?? [], sortedDays),
    [overview?.available_years, sortedDays],
  );

  React.useEffect(() => {
    if (selectedYear || !overview) return;
    const latestYear = availableYears[availableYears.length - 1];
    if (latestYear) setSelectedYear(latestYear);
  }, [availableYears, overview, selectedYear]);

  const heatmapYear =
    selectedYear || availableYears[availableYears.length - 1] || "";

  React.useEffect(() => {
    setHeatmapTooltip(null);
  }, [heatmapYear, metric, overview?.generated_at]);

  const heatmapWeeks = React.useMemo(
    () => buildHeatmapWeeks(sortedDays, heatmapYear, metric),
    [heatmapYear, metric, sortedDays],
  );
  const ditherWeeks: DitherHeatmapCell[][] = React.useMemo(
    () =>
      heatmapWeeks.map((week) =>
        week.cells.map((cell) => ({
          level: cell.count === null ? null : cell.level,
        })),
      ),
    [heatmapWeeks],
  );
  const heatmapMonthLabels = React.useMemo(
    () =>
      buildHeatmapMonthLabels(heatmapWeeks, heatmapYear, locale).map((m) => ({
        label: m.label,
        weekIndex: m.weekIndex,
      })),
    [heatmapWeeks, heatmapYear, locale],
  );
  const heatmapWeekdayLabels = React.useMemo(
    () =>
      buildHeatmapWeekdayAxisLabels({
        mon: t("heatmap.days.mon"),
        wed: t("heatmap.days.wed"),
        fri: t("heatmap.days.fri"),
      }),
    [t],
  );

  const timelineSeries = React.useMemo(
    () => buildTimelineSeries(sortedDays, resolution, locale),
    [locale, resolution, sortedDays],
  );
  const growthValues = React.useMemo(
    () => timelineSeries.map((p) => (metric === "cost" ? p.cost : p.tokens)),
    [metric, timelineSeries],
  );
  const timelineLabels = React.useMemo(
    () => timelineSeries.map((p) => p.label),
    [timelineSeries],
  );
  const formatMetric = React.useCallback(
    (value: number) => formatMetricValue(value, metric, locale, "compact"),
    [locale, metric],
  );
  const formatMetricSliding = React.useCallback(
    (value: number): DitherTooltipSliding =>
      metric === "cost"
        ? currencySlidingParts(value, locale, "compact")
        : compactSlidingParts(value, locale),
    [locale, metric],
  );

  const otherLabel = t("charts.agent.other");
  const breakdownSeries = React.useMemo(
    () =>
      buildBreakdownSeries(sortedDays, resolution, locale, metric, dimension),
    [dimension, locale, metric, resolution, sortedDays],
  );
  const stackedBars = React.useMemo(() => {
    const rows = breakdownSeries.data;
    const maxCols = resolution === "day" ? 10 : 8;
    const slice = rows.length > maxCols ? rows.slice(rows.length - maxCols) : rows;
    return slice.map((row) => ({
      label: String(row.label ?? ""),
      segments: breakdownSeries.keys.map((key) => Number(row[key] ?? 0)),
    }));
  }, [breakdownSeries, resolution]);

  const heatmapSummary = React.useMemo(
    () => summarizeYear(sortedDays, heatmapYear),
    [heatmapYear, sortedDays],
  );
  const yearlyBreakdownShares = React.useMemo(
    () =>
      buildYearBreakdownShares(
        sortedDays,
        heatmapYear,
        metric,
        dimension,
        otherLabel,
      ),
    [dimension, heatmapYear, metric, otherLabel, sortedDays],
  );

  const breakdownBars = React.useMemo(() => {
    const fromOverview = buildOverviewBreakdownShares(
      overview,
      metric,
      dimension,
      otherLabel,
    );
    if (fromOverview.length > 0) return fromOverview;
    return yearlyBreakdownShares;
  }, [dimension, metric, otherLabel, overview, yearlyBreakdownShares]);

  const tokenMix = React.useMemo(() => summarizeTokenMix(sortedDays), [sortedDays]);
  const mixSlices = React.useMemo(() => tokenMixSlices(tokenMix), [tokenMix]);

  const segmentLabels = React.useMemo(
    () =>
      breakdownSeries.keys.map((k) =>
        formatDimensionLabel(k, dimension, otherLabel),
      ),
    [breakdownSeries.keys, dimension, otherLabel],
  );

  const segmentColorIds = React.useMemo(() => {
    const ids: string[] = [];
    const seen = new Set<string>();
    for (const id of breakdownSeries.keys) {
      if (!seen.has(id)) {
        seen.add(id);
        ids.push(id);
      }
    }
    for (const bar of breakdownBars) {
      if (!seen.has(bar.id)) {
        seen.add(bar.id);
        ids.push(bar.id);
      }
    }
    return ids;
  }, [breakdownBars, breakdownSeries.keys]);

  const segmentColorAssignment = React.useMemo(
    () => assignAgentChartColors(segmentColorIds, ditherTheme),
    [ditherTheme, segmentColorIds],
  );
  const segmentColors = React.useMemo(
    () => breakdownSeries.keys.map((id) => segmentColorAssignment.get(id)!),
    [breakdownSeries.keys, segmentColorAssignment],
  );
  const segmentKeys = breakdownSeries.keys;
  const modelProviderById = React.useMemo(
    () => buildModelProviderMap(overview, sortedDays),
    [overview, sortedDays],
  );

  const segmentIcons = React.useMemo(() => {
    return segmentKeys.map((k, index) => {
      const name = segmentLabels[index] ?? k;
      const color = segmentColors[index];
      if (dimension === "agent") {
        return (
          <TokenUsageAgentIcon
            key={k}
            clientId={k}
            name={name}
            size={12}
            color={color}
          />
        );
      }
      return (
        <TokenUsageModelIcon
          key={k}
          modelId={k}
          providerId={modelProviderById.get(k)}
          name={name}
          size={12}
          color={color}
        />
      );
    });
  }, [
    dimension,
    modelProviderById,
    segmentColors,
    segmentKeys,
    segmentLabels,
  ]);

  const rangeLabel =
    overview?.summary.range_start && overview.summary.range_end
      ? t("range.withBounds", {
          start: overview.summary.range_start,
          end: overview.summary.range_end,
        })
      : t("range.empty");

  const emptyYear =
    !loading && !!overview && heatmapSummary.activeDays === 0;
  const shell = "bg-background text-foreground";
  const muted = isDark ? "text-white/45" : "text-black/45";
  const border = isDark ? "border-white/[0.07]" : "border-black/[0.08]";
  const panel = isDark
    ? "border-white/[0.06] bg-[#141414]"
    : "border-black/[0.06] bg-[#f4f4f5]";

  return (
    <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-2 px-4 py-4 sm:px-5 sm:py-5">
      <div
        className="flex h-8 flex-nowrap items-center gap-x-1"
        {...{ ["data-token-usage-share-exclude"]: "" }}
      >
        <div className="flex min-w-0 flex-nowrap items-center gap-x-0.5">
          <TokenUsageCycleButton
            value={metric}
            options={metricCycleOptions}
            onValueChange={(next) => {
              if (next === "tokens" || next === "cost") setMetric(next);
            }}
          />
          <TokenUsageCycleButton
            value={dimension}
            options={dimensionCycleOptions}
            onValueChange={(next) => {
              if (next === "agent" || next === "model") setDimension(next);
            }}
          />
        </div>
        {toolbarEnd ? <div className="ml-auto shrink-0">{toolbarEnd}</div> : null}
      </div>

      <div
        ref={captureTargetRef}
        className={cn(
          "box-border flex w-full flex-col gap-4 px-1 pb-4 pt-0 sm:px-2 sm:pb-5",
          shell,
        )}
      >
        <TokenUsageOverviewTab
          loading={loading}
          muted={muted}
          border={border}
          panel={panel}
          isDark={isDark}
          ditherTheme={ditherTheme}
          metric={metric}
          dimension={dimension}
          overview={overview}
          rangeLabel={rangeLabel}
          breakdownBars={breakdownBars}
          mixSlices={mixSlices}
          emptyYear={emptyYear}
          heatmapYear={heatmapYear}
          availableYears={availableYears}
          onHeatmapYearChange={setSelectedYear}
          ditherWeeks={ditherWeeks}
          heatmapWeeks={heatmapWeeks}
          heatmapMonthLabels={heatmapMonthLabels}
          heatmapWeekdayLabels={heatmapWeekdayLabels}
          heatmapTooltip={heatmapTooltip}
          setHeatmapTooltip={setHeatmapTooltip}
          growthValues={growthValues}
          timelineLabels={timelineLabels}
          stackedBars={stackedBars}
          segmentKeys={segmentKeys}
          segmentLabels={segmentLabels}
          segmentIcons={segmentIcons}
          segmentColors={segmentColors}
          segmentColorAssignment={segmentColorAssignment}
          uniqueModelCount={uniqueModelCount}
          resolution={resolution}
          onResolutionChange={setResolution}
          formatMetric={formatMetric}
          formatMetricSliding={formatMetricSliding}
          locale={locale}
          t={t}
        />
      </div>
    </div>
  );
}
