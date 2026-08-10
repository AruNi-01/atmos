"use client";

import * as React from "react";
import { Activity, Bot, Cpu, DollarSign, Hash } from "lucide-react";
import {
  DitherFunnel,
  DitherGrowth,
  DitherHeatmap,
  DitherShareBar,
  DitherStackedBars,
  DitherTooltip,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  TabsSubtle,
  TabsSubtleItem,
  TerminalLoader,
  cn,
  type DitherHeatmapCell,
  type DitherTheme,
  type DitherTooltipState,
} from "@workspace/ui";
import { useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { useTheme } from "next-themes";

import type { TokenUsageOverviewResponse } from "@/api/ws/token-usage-api";
import { tokenUsageApi } from "@/api/ws/token-usage-api";
import { queryKeys } from "@/api/query/query-keys";
import { useComputerQueryScope } from "@/api/query/query-scope";
import { useTokenUsageQuery } from "@/features/quota-usage/hooks/use-token-usage-query";
import { AgentIcon } from "@/features/agent/components/AgentIcon";
import {
  agentChartColor,
  assignAgentChartColors,
  buildBreakdownSeries,
  buildHeatmapWeeks,
  buildOverviewBreakdownShares,
  buildTimelineSeries,
  buildYearBreakdownShares,
  formatCompactNumber,
  formatCurrencyCompact,
  formatCurrencyDetailed,
  formatDetailedNumber,
  formatDimensionLabel,
  formatHeatmapDate,
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
function normalizeAgentRegistryId(clientId: string): string {
  const normalized = clientId.trim().toLowerCase().replace(/_/g, "-");
  return TOKEN_USAGE_AGENT_ICON_ID[normalized] ?? normalized;
}

function TokenUsageAgentIcon({
  clientId,
  name,
  size = 12,
  color,
}: {
  clientId: string;
  name: string;
  size?: number;
  /** Optional monochrome tint (chart legend / segment key). */
  color?: string;
}) {
  if (clientId === "other") {
    return (
      <Bot
        className={cn("shrink-0", color ? undefined : "text-muted-foreground")}
        style={{ width: size, height: size, color: color || undefined }}
        aria-hidden
      />
    );
  }
  return (
    <AgentIcon
      registryId={normalizeAgentRegistryId(clientId)}
      name={name}
      size={size}
      color={color}
    />
  );
}

/** Center-stage token usage — single overview page (no tab chrome). */
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

  const segmentIcons = React.useMemo(() => {
    if (dimension !== "agent") return undefined;
    return segmentKeys.map((k, index) => (
      <TokenUsageAgentIcon
        key={k}
        clientId={k}
        name={segmentLabels[index] ?? k}
        size={12}
        color={segmentColors[index]}
      />
    ));
  }, [dimension, segmentColors, segmentKeys, segmentLabels]);

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
          <TerminalLoader
            rows={5}
            cols={40}
            blockWidth={3}
            speed={50}
            color={isDark ? "text-white" : "text-black"}
            bgColor={isDark ? "bg-white" : "bg-black"}
          />
        </div>
      ) : (
        <div className="relative z-[1] min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-4 px-4 py-4 sm:px-5 sm:py-5">
            {/* Toolbar — excluded from share screenshots */}
            <div
              className="flex flex-wrap items-center gap-x-3 gap-y-2"
              {...{ ["data-token-usage-share-exclude"]: "" }}
            >
              <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
                <TabsSubtle
                  activeLabel
                  idPrefix="token-usage-metric"
                  selectedIndex={metric === "tokens" ? 0 : 1}
                  onSelect={(index) => {
                    setMetric(index === 0 ? "tokens" : "cost");
                  }}
                  className="min-w-0"
                >
                  <TabsSubtleItem
                    index={0}
                    icon={Hash}
                    label={t("metric.tokens")}
                  />
                  <TabsSubtleItem
                    index={1}
                    icon={DollarSign}
                    label={t("metric.cost")}
                  />
                </TabsSubtle>
                <div
                  className={cn(
                    "h-4 w-px shrink-0 self-center",
                    isDark ? "bg-white/15" : "bg-black/15",
                  )}
                  role="separator"
                  aria-hidden
                />
                <TabsSubtle
                  activeLabel
                  idPrefix="token-usage-dimension"
                  selectedIndex={dimension === "agent" ? 0 : 1}
                  onSelect={(index) => {
                    setDimension(index === 0 ? "agent" : "model");
                  }}
                  className="min-w-0"
                >
                  <TabsSubtleItem
                    index={0}
                    icon={Bot}
                    label={t("dimension.agent")}
                  />
                  <TabsSubtleItem
                    index={1}
                    icon={Cpu}
                    label={t("dimension.model")}
                  />
                </TabsSubtle>
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

            {/* Capture target: overview body only (no tabs / share chrome). */}
            <div
              ref={captureTargetRef}
              className={cn("box-border flex w-full flex-col gap-4 p-4 sm:p-5", shell)}
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

              <OverviewTab
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

type Translate = ReturnType<typeof useTranslations>;

const MIX_COLORS_DARK = [
  "#38BDF8", // input — sky
  "#4ADE80", // output — green
  "#E879F9", // cache read — fuchsia
  "#FBBF24", // cache write — amber
  "#94A3B8", // reasoning — slate
] as const;

const MIX_COLORS_LIGHT = [
  "#0284C7",
  "#16A34A",
  "#C026D3",
  "#D97706",
  "#64748B",
] as const;

function mixSliceLabel(id: TokenMixSlice["id"], t: Translate): string {
  switch (id) {
    case "input":
      return t("charts.mix.input");
    case "output":
      return t("charts.mix.output");
    case "cacheRead":
      return t("charts.mix.cacheRead");
    case "cacheWrite":
      return t("charts.mix.cacheWrite");
    case "reasoning":
      return t("charts.mix.reasoning");
  }
}

function OverviewTab({
  loading,
  muted,
  border,
  panel,
  isDark,
  ditherTheme,
  metric,
  dimension,
  overview,
  rangeLabel,
  breakdownBars,
  mixSlices,
  emptyYear,
  heatmapYear,
  availableYears,
  onHeatmapYearChange,
  ditherWeeks,
  heatmapWeeks,
  heatmapTooltip,
  setHeatmapTooltip,
  growthValues,
  timelineLabels,
  stackedBars,
  segmentKeys,
  segmentLabels,
  segmentIcons,
  segmentColors,
  segmentColorAssignment,
  uniqueModelCount,
  resolution,
  onResolutionChange,
  formatMetric,
  locale,
  t,
}: {
  loading: boolean;
  muted: string;
  border: string;
  panel: string;
  isDark: boolean;
  ditherTheme: DitherTheme;
  metric: UsageMetric;
  dimension: UsageDimension;
  overview: TokenUsageOverviewResponse | null;
  rangeLabel: string;
  breakdownBars: BreakdownShare[];
  mixSlices: TokenMixSlice[];
  emptyYear: boolean;
  heatmapYear: string;
  availableYears: string[];
  onHeatmapYearChange: (year: string) => void;
  ditherWeeks: DitherHeatmapCell[][];
  heatmapWeeks: ReturnType<typeof buildHeatmapWeeks>;
  heatmapTooltip: DitherTooltipState | null;
  setHeatmapTooltip: (v: DitherTooltipState | null) => void;
  growthValues: number[];
  timelineLabels: string[];
  stackedBars: Array<{ label: string; segments: number[] }>;
  segmentKeys: string[];
  segmentLabels: string[];
  segmentIcons: React.ReactNode[] | undefined;
  segmentColors: string[];
  segmentColorAssignment: ReadonlyMap<string, string>;
  uniqueModelCount: number;
  resolution: Resolution;
  onResolutionChange: (value: Resolution) => void;
  formatMetric: (n: number) => string;
  locale: string;
  t: Translate;
}) {
  const totalTokens = overview?.summary.total_tokens ?? 0;
  const totalCost = overview?.summary.total_cost_usd ?? 0;
  const heroValue = metric === "cost" ? totalCost : totalTokens;
  const heroLabel =
    metric === "cost" ? t("stats.totalCost.label") : t("stats.totalTokens.label");
  const metricValueLabel =
    metric === "cost" ? t("charts.curve.cost") : t("charts.curve.tokens");
  const shareEmptyLabel =
    dimension === "model"
      ? t("heatmap.modelShareEmpty")
      : t("heatmap.agentShareEmpty");
  const messagesNote =
    dimension === "model"
      ? t("stats.messages.modelsNote", {
          count: formatDetailedNumber(uniqueModelCount, locale),
        })
      : t("stats.messages.note", {
          count: formatDetailedNumber(overview?.by_client.length ?? 0, locale),
        });
  const mixPalette = isDark ? MIX_COLORS_DARK : MIX_COLORS_LIGHT;
  const mixSegments = React.useMemo(
    () =>
      mixSlices.map((slice, index) => ({
        id: slice.id,
        label: mixSliceLabel(slice.id, t),
        value: slice.value,
        color: mixPalette[index % mixPalette.length],
      })),
    [mixPalette, mixSlices, t],
  );
  const hasMix = mixSegments.some((s) => s.value > 0);

  // Keep major section rhythm consistent (totals block / heatmap / trend row).
  const sectionGap = "gap-4";

  return (
    <div className={cn("flex flex-col", sectionGap)}>
      {/* All-time totals + agent share | stat cards (where trend used to sit) */}
      <div className="grid gap-4 xl:grid-cols-[minmax(240px,320px)_minmax(0,1fr)]">
        <div className="space-y-4">
          <div>
            <div className="flex items-baseline justify-between gap-3">
              <div className={cn("text-xs", muted)}>{heroLabel}</div>
              <div className={cn("shrink-0 text-right text-[11px] tabular-nums", muted)}>
                {rangeLabel}
              </div>
            </div>
            <div className="mt-1 text-4xl font-semibold tracking-tight tabular-nums sm:text-5xl">
              {loading ? "—" : formatMetric(heroValue)}
            </div>
          </div>

          <div className="space-y-3">
            {loading && breakdownBars.length === 0 ? (
              <div className={cn("text-xs", muted)}>{t("heatmap.loadingDescription")}</div>
            ) : null}
            {breakdownBars.map((row) => {
              const color = agentChartColor(
                row.id,
                ditherTheme,
                segmentColorAssignment,
              );
              return (
                <div key={row.id} className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="inline-flex min-w-0 items-center gap-2">
                      {dimension === "agent" ? (
                        <TokenUsageAgentIcon
                          clientId={row.id}
                          name={row.label}
                          size={16}
                        />
                      ) : (
                        <span
                          className="size-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: color }}
                          aria-hidden
                        />
                      )}
                      <span className="truncate font-medium" title={row.label}>
                        {row.label}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2 tabular-nums">
                      <span className={cn("text-xs", muted)}>
                        {Math.round(row.sharePercent)}%
                      </span>
                      <span>{formatMetric(row.value)}</span>
                    </span>
                  </div>
                  {/* Width = share of grand total so it matches the % label. */}
                  <div className="h-2.5 w-full">
                    <DitherFunnel
                      stages={[
                        {
                          label: row.label,
                          value: row.share,
                          color,
                        },
                      ]}
                      maxValue={1}
                      theme={ditherTheme}
                      gap={0}
                    />
                  </div>
                </div>
              );
            })}
            {!loading && breakdownBars.length === 0 ? (
              <div className={cn("text-xs", muted)}>{shareEmptyLabel}</div>
            ) : null}
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-3">
          <div className="grid grid-cols-2 gap-2.5 content-start">
            <StatChip
              panel={panel}
              muted={muted}
              label={t("stats.messages.label")}
              value={
                loading
                  ? "—"
                  : formatCompactNumber(overview?.summary.total_messages ?? 0, locale)
              }
              note={messagesNote}
            />
            <StatChip
              panel={panel}
              muted={muted}
              label={t("stats.activeDays.label")}
              value={
                loading
                  ? "—"
                  : formatCompactNumber(overview?.summary.active_days ?? 0, locale)
              }
              note={t("stats.activeDays.note")}
            />
            <StatChip
              panel={panel}
              muted={muted}
              label={t("stats.estimatedCost.label")}
              value={
                loading
                  ? "—"
                  : formatCurrencyCompact(overview?.summary.total_cost_usd ?? 0, locale)
              }
              note={t("stats.estimatedCost.note")}
            />
            <StatChip
              panel={panel}
              muted={muted}
              label={t("stats.totalTokens.label")}
              value={
                loading
                  ? "—"
                  : formatCompactNumber(overview?.summary.total_tokens ?? 0, locale)
              }
              note={rangeLabel}
            />
          </div>

          {/* All-time token mix — horizontal dither share bar + legend */}
          <div className={cn("rounded-xl border px-3 py-3", panel)}>
            <div className={cn("mb-2 text-[11px]", muted)}>{t("charts.mix.title")}</div>
            {hasMix && !loading ? (
              <>
                <div className="h-3 w-full shrink-0 overflow-hidden">
                  <DitherShareBar
                    segments={mixSegments}
                    theme={ditherTheme}
                    formatValue={(v) => formatCompactNumber(v, locale)}
                    formatShare={(s) =>
                      `${(Math.round(s * 1000) / 10).toLocaleString(locale, {
                        maximumFractionDigits: 1,
                      })}%`
                    }
                  />
                </div>
                <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-3 xl:grid-cols-5">
                  {mixSegments.map((seg, index) => {
                    const slice = mixSlices[index];
                    const sharePercent = slice?.sharePercent ?? 0;
                    return (
                      <div key={seg.id} className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span
                            className="size-1.5 shrink-0 rounded-full"
                            style={{ backgroundColor: seg.color }}
                            aria-hidden
                          />
                          <span className={cn("truncate text-[11px]", muted)}>{seg.label}</span>
                        </div>
                        <div className="mt-0.5 flex items-baseline gap-1.5 pl-3">
                          <span className="text-sm font-semibold tabular-nums tracking-tight">
                            {formatCompactNumber(seg.value, locale)}
                          </span>
                          <span className={cn("text-[11px] tabular-nums", muted)}>
                            {sharePercent < 0.1 && seg.value > 0
                              ? "<0.1%"
                              : `${Math.round(sharePercent * 10) / 10}%`}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <div className={cn("flex h-10 items-center text-xs", muted)}>
                {loading ? t("heatmap.loadingDescription") : t("charts.mix.empty")}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Heatmap — year only affects this chart; overview stats stay all-time */}
      <div className="flex w-full flex-col gap-1.5">
        <div className="flex justify-end">
          <Select
            value={heatmapYear || undefined}
            onValueChange={onHeatmapYearChange}
            disabled={loading || availableYears.length === 0}
          >
            <SelectTrigger
              className={cn(
                "h-8 w-[100px] rounded-lg border text-xs",
                border,
                isDark ? "bg-white/[0.04]" : "bg-black/[0.04]",
              )}
            >
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
        </div>

        {emptyYear ? (
          <div
            className={cn(
              "flex h-[132px] w-full items-center justify-center text-xs sm:h-[148px]",
              muted,
            )}
          >
            {loading ? t("heatmap.loadingDescription") : t("heatmap.empty")}
          </div>
        ) : (
          // Height tracks the 7-row grid (top-aligned) so we don't leave a tall empty band
          // under the cells before the next section.
          <div className="relative h-[132px] w-full sm:h-[148px]">
            <DitherHeatmap
              weeks={ditherWeeks}
              theme={ditherTheme}
              onCellHover={(weekIndex, dayIndex, rect) => {
                const cell = heatmapWeeks[weekIndex]?.cells[dayIndex];
                if (!cell || cell.count === null || !cell.detail) {
                  setHeatmapTooltip(null);
                  return;
                }
                const detail = cell.detail;
                const primaryLines =
                  metric === "cost"
                    ? [
                        {
                          label: t("heatmap.popover.cost"),
                          value: formatCurrencyDetailed(
                            detail.total_cost_usd,
                            locale,
                          ),
                        },
                        {
                          label: t("heatmap.popover.tokens"),
                          value: formatDetailedNumber(detail.total_tokens, locale),
                        },
                      ]
                    : [
                        {
                          label: t("heatmap.popover.tokens"),
                          value: formatDetailedNumber(detail.total_tokens, locale),
                        },
                        {
                          label: t("heatmap.popover.cost"),
                          value: formatCurrencyDetailed(
                            detail.total_cost_usd,
                            locale,
                          ),
                        },
                      ];
                setHeatmapTooltip({
                  clientX: rect.left + rect.width / 2,
                  clientY: rect.top,
                  title: formatHeatmapDate(cell.date, locale),
                  lines: [
                    ...primaryLines,
                    {
                      label: t("heatmap.popover.messages"),
                      value: formatDetailedNumber(detail.message_count, locale),
                    },
                    {
                      label: t("heatmap.popover.input"),
                      value: formatDetailedNumber(detail.breakdown.input_tokens, locale),
                    },
                    {
                      label: t("heatmap.popover.output"),
                      value: formatDetailedNumber(detail.breakdown.output_tokens, locale),
                    },
                    {
                      label: t("heatmap.popover.cache"),
                      value: formatDetailedNumber(
                        detail.breakdown.cache_read_tokens +
                          detail.breakdown.cache_write_tokens,
                        locale,
                      ),
                    },
                    {
                      label: t("heatmap.popover.reasoning"),
                      value: formatDetailedNumber(
                        detail.breakdown.reasoning_tokens,
                        locale,
                      ),
                    },
                  ],
                });
              }}
              onCellLeave={() => setHeatmapTooltip(null)}
            />
            <DitherTooltip state={heatmapTooltip} theme={ditherTheme} />
          </div>
        )}
      </div>

      {/* Trend (wider) + Agents by resolution — share month/day tabs */}
      <div className="flex w-full flex-col gap-1.5">
        <div className="flex justify-end">
          <TabsSubtle
            idPrefix="token-usage-trend-resolution"
            selectedIndex={resolution === "month" ? 0 : 1}
            onSelect={(index) => {
              onResolutionChange(index === 0 ? "month" : "day");
            }}
            className="min-w-0"
          >
            <TabsSubtleItem
              index={0}
              label={t("resolution.options.month")}
            />
            <TabsSubtleItem
              index={1}
              label={t("resolution.options.day")}
            />
          </TabsSubtle>
        </div>
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
          {/* Token trend — bare, takes more width */}
          {growthValues.length === 0 && !loading ? (
            <div
              className={cn(
                "flex h-[240px] w-full items-center justify-center text-xs sm:h-[280px]",
                muted,
              )}
            >
              {t("heatmap.empty")}
            </div>
          ) : (
            <div className="relative h-[240px] w-full min-w-0 sm:h-[280px]">
              <DitherGrowth
                values={growthValues}
                labels={timelineLabels}
                theme={ditherTheme}
                valueLabel={metricValueLabel}
                formatValue={formatMetric}
              />
            </div>
          )}

          {/* Breakdown by agent/model over month/day — bare chart + color key legend */}
          {stackedBars.length === 0 && !loading ? (
            <div
              className={cn(
                "flex h-[240px] w-full items-center justify-center text-xs sm:h-[280px]",
                muted,
              )}
            >
              {t("heatmap.empty")}
            </div>
          ) : (
            <div className="flex min-w-0 flex-col gap-2">
              <div className="relative h-[210px] w-full min-w-0 sm:h-[248px]">
                <DitherStackedBars
                  bars={stackedBars}
                  colors={segmentColors}
                  theme={ditherTheme}
                  segmentLabels={segmentLabels}
                  segmentIcons={segmentIcons}
                  formatValue={formatMetric}
                />
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-0.5">
                {segmentKeys.map((segmentId, index) => {
                  const color =
                    segmentColors[index] ??
                    agentChartColor(segmentId, ditherTheme, segmentColorAssignment);
                  const label = segmentLabels[index] ?? segmentId;
                  return (
                    <span
                      key={segmentId}
                      className="inline-flex min-w-0 max-w-full items-center gap-1.5 text-[11px] font-medium"
                      style={{ color }}
                      title={label}
                    >
                      {dimension === "agent" ? (
                        <TokenUsageAgentIcon
                          clientId={segmentId}
                          name={label}
                          size={12}
                          color={color}
                        />
                      ) : (
                        <span
                          className="size-1.5 shrink-0 rounded-full"
                          style={{ backgroundColor: color }}
                          aria-hidden
                        />
                      )}
                      <span className="truncate">{label}</span>
                    </span>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatChip({
  panel,
  muted,
  label,
  value,
  note,
}: {
  panel: string;
  muted: string;
  label: string;
  value: string;
  note: string;
}) {
  return (
    <div className={cn("rounded-xl border px-3 py-2.5", panel)}>
      <div className={cn("text-[11px]", muted)}>{label}</div>
      <div className="mt-1 text-xl font-semibold tracking-tight tabular-nums">{value}</div>
      <div className={cn("mt-0.5 truncate text-[10px]", muted)}>{note}</div>
    </div>
  );
}
