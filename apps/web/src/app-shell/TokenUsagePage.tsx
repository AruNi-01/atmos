"use client";

import * as React from "react";
import { Activity, Bot, BrainCircuit, Coins, DollarSign } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import {
  TerminalLoader,
  cn,
  compactSlidingParts,
  currencySlidingParts,
  type DitherTheme,
  type DitherTooltipSliding,
  type DitherTooltipState,
  type DitherHeatmapCell,
} from "@workspace/ui";
import { useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { useTheme } from "next-themes";

import type { TokenUsageOverviewResponse } from "@/api/ws/token-usage-api";
import { tokenUsageApi } from "@/api/ws/token-usage-api";
import { queryKeys } from "@/api/query/query-keys";
import { useComputerQueryScope } from "@/api/query/query-scope";
import { useTokenUsageQuery } from "@/features/quota-usage/hooks/use-token-usage-query";
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
  type BreakdownShare,
  type Resolution,
  type TokenMixSlice,
  type UsageDimension,
  type UsageMetric,
} from "@/app-shell/token-usage-dialog-utils";
import { TokenUsageSharePopover } from "@/app-shell/TokenUsageShareDialog";
import {
  TokenUsageOverviewTab,
  TokenUsageAgentIcon,
  TokenUsageModelIcon,
} from "@/app-shell/TokenUsageOverviewTab";

/** i18n keys under `tokenUsageDialog.loading.tips` — fun status lines while overview loads. */
const TOKEN_USAGE_LOADING_TIP_KEYS = [
  "tallyingAgents",
  "countingLateNight",
  "reconcilingInvoices",
  "tracingCacheHits",
  "weighingInOut",
  "askingAgents",
  "buildingHeatmap",
  "sortingAppetite",
  "estimatingCost",
  "unwindingWindows",
  "negotiatingLedger",
  "polishingBreakdown",
] as const;

const TOKEN_USAGE_LOADING_TIP_INTERVAL_MS = 2800;

const CYCLE_EASE = [0.22, 1, 0.36, 1] as const;
const CYCLE_TRANSITION = { duration: 0.2, ease: CYCLE_EASE } as const;

/**
 * Click-to-cycle toolbar control (Tokens↔Cost, Agent↔Model).
 * Plain button + short opacity/y crossfade — no layout thrash.
 */
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
      <span className="relative size-4 shrink-0">
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={active.id}
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            transition={CYCLE_TRANSITION}
            className="absolute inset-0 flex items-center justify-center"
          >
            {active.icon}
          </motion.span>
        </AnimatePresence>
      </span>
      <span className="relative inline-grid overflow-hidden leading-none">
        {/* Invisible sizer keeps width stable for the longest option while
            the visible label crossfades on top — no toolbar reflow. */}
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

function shuffleCopy<T>(items: readonly T[]): T[] {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = next[i]!;
    next[i] = next[j]!;
    next[j] = tmp;
  }
  return next;
}

/** Rotating, playful loading copy for the full-page token usage skeleton. */
function TokenUsageLoadingTips({ className }: { className?: string }) {
  const t = useTranslations("appShell.tokenUsageDialog");
  const tips = React.useMemo(
    () => TOKEN_USAGE_LOADING_TIP_KEYS.map((key) => t(`loading.tips.${key}`)),
    [t],
  );
  // Start ordered for SSR/hydration safety; shuffle once on the client.
  const [orderedTips, setOrderedTips] = React.useState(tips);
  const [index, setIndex] = React.useState(0);

  React.useEffect(() => {
    setOrderedTips(shuffleCopy(tips));
    setIndex(0);
  }, [tips]);

  React.useEffect(() => {
    if (orderedTips.length <= 1) return;
    const id = window.setInterval(() => {
      setIndex((prev) => (prev + 1) % orderedTips.length);
    }, TOKEN_USAGE_LOADING_TIP_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [orderedTips.length]);

  const tip = orderedTips[index] ?? orderedTips[0] ?? "";

  return (
    <div
      className={cn(
        "relative mt-1 flex min-h-[2.75rem] w-full max-w-sm items-start justify-center px-2",
        className,
      )}
      aria-live="polite"
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.p
          key={`${index}-${tip}`}
          initial={{ opacity: 0, y: 10, filter: "blur(4px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          exit={{ opacity: 0, y: -10, filter: "blur(4px)" }}
          transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
          className="absolute inset-x-0 text-center text-xs leading-relaxed tracking-wide"
        >
          {tip}
        </motion.p>
      </AnimatePresence>
    </div>
  );
}

/**
 * Map tokscale client ids onto AgentIcon registry / asset names.
 * Keep in sync with `AGENT_ICON_REMAP` / public `/agents/*` assets.
 */
const TOKEN_USAGE_AGENT_ICON_ID: Record<string, string> = {
  claude: "claude-code",
  roocode: "roo",
  kilocode: "kilo",
  kilo: "kilo",
  kiro: "kiro-cli",
  commandcode: "command-code",
  qwen: "qwen-code",
  codebuddy: "codebuddy-code",
  workbuddy: "codebuddy-code",
  "devin-cli": "devin",
  "devin-desktop": "devin",
  "antigravity-cli": "antigravity",
  augment: "auggie",
  grok: "grok-build",
  copilot: "copilot",
  "factory-droid": "droid",
  "github-copilot": "copilot",
};

/** Normalize token-usage client ids toward AgentIcon registry ids. */
export function TokenUsagePage() {
  const [selectedYear, setSelectedYear] = React.useState("");
  const [resolution, setResolution] = React.useState<Resolution>("month");
  const [metric, setMetric] = React.useState<UsageMetric>("tokens");
  const [dimension, setDimension] = React.useState<UsageDimension>("agent");
  const [heatmapTooltip, setHeatmapTooltip] =
    React.useState<DitherTooltipState | null>(null);
  const captureTargetRef = React.useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const scope = useComputerQueryScope();
  const t = useTranslations("appShell.tokenUsageDialog");
  const locale = useLocale();
  const { resolvedTheme } = useTheme();
  const ditherTheme: DitherTheme = resolvedTheme === "light" ? "light" : "dark";
  const isDark = ditherTheme === "dark";

  const metricCycleOptions = React.useMemo(
    () => [
      {
        id: "tokens",
        label: t("metric.tokens"),
        icon: <Coins className="size-4" aria-hidden />,
      },
      {
        id: "cost",
        label: t("metric.cost"),
        icon: <DollarSign className="size-4" aria-hidden />,
      },
    ],
    [t],
  );

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

  // Overview is all-time totals; year only filters the heatmap client-side.
  const tokenUsageQuery = useTokenUsageQuery({ year: null });
  const overview: TokenUsageOverviewResponse | null = tokenUsageQuery.data ?? null;
  const loading = tokenUsageQuery.isLoading && !tokenUsageQuery.data;
  const error = tokenUsageQuery.isError
    ? tokenUsageQuery.error instanceof Error
      ? tokenUsageQuery.error.message
      : t("errors.loadOverviewFallback")
    : null;

  // Soft refresh whenever the page is opened / remounted (async, keep cached UI).
  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const next = await tokenUsageApi.getOverview({
          refresh: true,
          year: null,
        });
        if (cancelled) return;
        queryClient.setQueryData(
          queryKeys.computer.tokenUsageOverview(scope, {
            year: null,
            since: null,
            until: null,
            clients: null,
            groupBy: null,
          }),
          next,
        );
      } catch {
        // Keep cached overview on background refresh failure.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [queryClient, scope]);

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

  /** Stacked series — agent clients or models depending on dimension tab. */
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

  /** Share bars — all-time from overview (by_client / by_model), else year fallback. */
  const breakdownBars: BreakdownShare[] = React.useMemo(() => {
    const fromOverview = buildOverviewBreakdownShares(
      overview,
      metric,
      dimension,
      otherLabel,
    );
    if (fromOverview.length > 0) return fromOverview;
    return yearlyBreakdownShares;
  }, [dimension, metric, otherLabel, overview, yearlyBreakdownShares]);

  /** All-time token mix from daily breakdown — no extra API (tokscale fields already present). */
  const tokenMix = React.useMemo(() => summarizeTokenMix(sortedDays), [sortedDays]);
  const mixSlices = React.useMemo(() => tokenMixSlices(tokenMix), [tokenMix]);

  const segmentLabels = React.useMemo(
    () =>
      breakdownSeries.keys.map((k) =>
        formatDimensionLabel(k, dimension, otherLabel),
      ),
    [breakdownSeries.keys, dimension, otherLabel],
  );

  /**
   * Union of ranked series keys + share list so both charts share one
   * collision-free color assignment for the active dimension.
   */
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

  /** Shared palette keyed by series id — share bars + stacked breakdown. */
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

  const uniqueModelCount = React.useMemo(() => {
    if (!overview?.by_model?.length) return 0;
    return new Set(
      overview.by_model.map((row) => row.model_id.trim() || "unknown"),
    ).size;
  }, [overview?.by_model]);

  const rangeLabel =
    overview?.summary.range_start && overview.summary.range_end
      ? t("range.withBounds", {
          start: overview.summary.range_start,
          end: overview.summary.range_end,
        })
      : t("range.empty");

  const emptyYear =
    !loading && !error && !!overview && heatmapSummary.activeDays === 0;
  // Match app shell canvas (`--background`), keep soft dot grid.
  const shell = "bg-background text-foreground";
  const muted = isDark ? "text-white/45" : "text-black/45";
  const border = isDark ? "border-white/[0.07]" : "border-black/[0.08]";
  const panel = isDark
    ? "border-white/[0.06] bg-[#141414]"
    : "border-black/[0.06] bg-[#f4f4f5]";

  return (
    <div className={cn("relative flex h-full min-h-0 flex-col", shell)}>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.28]"
        style={{
          backgroundImage: isDark
            ? "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.05) 1px, transparent 0)"
            : "radial-gradient(circle at 1px 1px, rgba(0,0,0,0.04) 1px, transparent 0)",
          backgroundSize: "12px 12px",
        }}
      />

      {loading ? (
        <div
          className="relative z-[1] flex min-h-0 flex-1 items-center justify-center p-12 select-none"
          role="status"
          aria-live="polite"
          aria-busy="true"
          aria-label={t("heatmap.loadingDescription")}
        >
          <div className="flex flex-col items-center gap-6">
            <TerminalLoader
              rows={5}
              cols={40}
              blockWidth={3}
              speed={50}
              color={isDark ? "text-white" : "text-black"}
              bgColor={isDark ? "bg-white" : "bg-black"}
            />
            <TokenUsageLoadingTips className={muted} />
          </div>
        </div>
      ) : (
        <div className="relative z-[1] min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {/* gap-2 keeps toolbar tight to content; capture uses pt-0 so we don't
              stack gap + padding into a large empty band under the controls. */}
          <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-2 px-4 py-4 sm:px-5 sm:py-5">
            {/* Toolbar — excluded from share screenshots */}
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
              <div className="ml-auto shrink-0">
                <TokenUsageSharePopover
                  captureTargetRef={captureTargetRef}
                  locale={locale}
                  isDark={isDark}
                  totalTokens={overview?.summary.total_tokens ?? 0}
                  totalCost={overview?.summary.total_cost_usd ?? null}
                  disabled={loading || !overview}
                />
              </div>
            </div>

            {/* Capture target: overview body only (no tabs / share chrome).
                No top padding — toolbar gap is enough; share card still has
                horizontal + bottom padding. */}
            <div
              ref={captureTargetRef}
              className={cn(
                "box-border flex w-full flex-col gap-4 px-1 pb-4 pt-0 sm:px-2 sm:pb-5",
                shell,
              )}
            >
              {error ? (
                <div className="flex items-center gap-3 rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-4">
                  <Activity className="size-4 shrink-0 text-destructive" />
                  <div className="space-y-0.5">
                    <div className="text-sm font-medium">{t("errors.loadOverviewTitle")}</div>
                    <div className={cn("text-xs", muted)}>{error}</div>
                  </div>
                </div>
              ) : null}

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
        </div>
      )}
    </div>
  );
}
