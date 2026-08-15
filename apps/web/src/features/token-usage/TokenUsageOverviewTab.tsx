"use client";

import * as React from "react";
import {
  DitherFunnel,
  DitherGrowth,
  DitherHeatmap,
  DitherShareBar,
  DitherStackedBars,
  DitherTooltip,
  IconSwap,
  IconSwapItem,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SlidingMetric,
  TabsSubtle,
  TabsSubtleItem,
  cn,
  compactSlidingParts,
  currencySlidingParts,
  detailedSlidingParts,
  percentSlidingParts,
  type DitherHeatmapCell,
  type DitherTheme,
  type DitherTooltipSliding,
  type DitherTooltipState,
  type SlidingMetricParts,
} from "@workspace/ui";
import { useTranslations } from "next-intl";

import type { TokenUsageOverviewResponse } from "@/api/ws/token-usage-api";
import {
  TokenUsageAgentIcon,
  TokenUsageModelIcon,
} from "@/features/token-usage/TokenUsageIcons";
import { TokenUsageStatChip } from "@/features/token-usage/TokenUsageStatChip";
import {
  agentChartColor,
  buildHeatmapWeeks,
  formatCompactNumber,
  formatCurrencyCompact,
  formatDetailedNumber,
  formatHeatmapDate,
  type BreakdownShare,
  type Resolution,
  type TokenMixSlice,
  type UsageDimension,
  type UsageMetric,
} from "@/features/token-usage/token-usage-dialog-utils";

// Re-export icons so existing `TokenUsageOverviewTab` import paths keep working.
export { TokenUsageAgentIcon, TokenUsageModelIcon } from "@/features/token-usage/TokenUsageIcons";

/** Center-stage token usage — single overview page (no tab chrome). */

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

export function TokenUsageOverviewTab({
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
  heatmapMonthLabels,
  heatmapWeekdayLabels,
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
  formatMetricSliding,
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
  heatmapMonthLabels: Array<{ label: string; weekIndex: number }>;
  heatmapWeekdayLabels: Array<{ label: string; row: number }>;
  heatmapTooltip: DitherTooltipState | null;
  setHeatmapTooltip: React.Dispatch<
    React.SetStateAction<DitherTooltipState | null>
  >;
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
  formatMetricSliding: (n: number) => DitherTooltipSliding;
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
      <div className="grid gap-6 xl:grid-cols-[minmax(220px,280px)_minmax(0,1fr)] xl:gap-8">
        <div className="space-y-4">
          <div>
            <div className="flex items-baseline justify-between gap-3">
              <div className={cn("text-xs", muted)}>{heroLabel}</div>
              <div className={cn("shrink-0 text-right text-[11px] tabular-nums", muted)}>
                {rangeLabel}
              </div>
            </div>
            <div className="mt-1 text-4xl font-semibold leading-none tracking-tight tabular-nums sm:text-5xl">
              {loading ? (
                "—"
              ) : (
                // Stable tree: never remount SlidingMetric on metric toggle so
                // digit springs can morph tokens ↔ cost mantissas.
                <SlidingMetric
                  {...(metric === "cost"
                    ? currencySlidingParts(heroValue, locale, "compact")
                    : compactSlidingParts(heroValue, locale))}
                />
              )}
            </div>
          </div>

          <div className="space-y-3">
            {loading && breakdownBars.length === 0 ? (
              <div className={cn("text-xs", muted)}>{t("heatmap.loadingDescription")}</div>
            ) : null}
            {breakdownBars.map((row, rankIndex) => {
              const color = agentChartColor(
                row.id,
                ditherTheme,
                segmentColorAssignment,
              );
              // Rank-stable key so agent↔model (and metric) retargets morph
              // the same funnel instance instead of remounting from 0.
              return (
                <div key={`share-rank-${rankIndex}`} className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="inline-flex min-w-0 items-center gap-2">
                      <span className="inline-flex size-4 shrink-0 items-center justify-center">
                        <IconSwap>
                          <IconSwapItem key={`${dimension}-${row.id}`}>
                            {dimension === "agent" ? (
                              <TokenUsageAgentIcon
                                clientId={row.id}
                                name={row.label}
                                size={16}
                              />
                            ) : (
                              <TokenUsageModelIcon
                                modelId={row.id}
                                providerId={row.providerId}
                                name={row.label}
                                size={16}
                              />
                            )}
                          </IconSwapItem>
                        </IconSwap>
                      </span>
                      <span className="truncate font-medium" title={row.label}>
                        {row.label}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2 tabular-nums">
                      <span className={cn("text-xs", muted)}>
                        <SlidingMetric
                          {...percentSlidingParts(row.sharePercent, locale, 1)}
                        />
                      </span>
                      <SlidingMetric
                        {...(metric === "cost"
                          ? currencySlidingParts(row.value, locale, "compact")
                          : compactSlidingParts(row.value, locale))}
                      />
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

        <div className="flex h-full min-w-0 flex-col gap-2.5">
          <div className="grid flex-[2] grid-cols-2 gap-2.5">
            <TokenUsageStatChip
              isDark={isDark}
              label={t("stats.messages.label")}
              value={
                loading ? (
                  "—"
                ) : (
                  <SlidingMetric
                    {...compactSlidingParts(
                      overview?.summary.total_messages ?? 0,
                      locale,
                    )}
                  />
                )
              }
              note={messagesNote}
              illustration="messages"
            />
            <TokenUsageStatChip
              isDark={isDark}
              label={t("stats.activeDays.label")}
              value={
                loading ? (
                  "—"
                ) : (
                  <SlidingMetric
                    {...detailedSlidingParts(
                      overview?.summary.active_days ?? 0,
                      locale,
                      0,
                    )}
                  />
                )
              }
              note={t("stats.activeDays.note")}
              illustration="activeDays"
            />
            <TokenUsageStatChip
              isDark={isDark}
              label={t("stats.estimatedCost.label")}
              value={
                loading ? (
                  "—"
                ) : (
                  <SlidingMetric
                    {...currencySlidingParts(
                      overview?.summary.total_cost_usd ?? 0,
                      locale,
                      "compact",
                    )}
                  />
                )
              }
              note={t("stats.estimatedCost.note")}
              illustration="cost"
            />
            <TokenUsageStatChip
              isDark={isDark}
              label={t("stats.totalTokens.label")}
              value={
                loading ? (
                  "—"
                ) : (
                  <SlidingMetric
                    {...compactSlidingParts(
                      overview?.summary.total_tokens ?? 0,
                      locale,
                    )}
                  />
                )
              }
              note={rangeLabel}
              illustration="tokens"
            />
          </div>

          {/* All-time token mix — horizontal dither share bar + legend */}
          <div className={cn("flex shrink-0 flex-col justify-center rounded-xl border px-3 py-4", panel)}>
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
                        minimumFractionDigits: 1,
                        maximumFractionDigits: 1,
                      })}%`
                    }
                    formatSliding={(v) => compactSlidingParts(v, locale)}
                    formatShareSliding={(s) =>
                      percentSlidingParts(s * 100, locale, 1)
                    }
                    valueLabel={t("charts.mix.amount")}
                    shareLabel={t("charts.mix.share")}
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
                            <SlidingMetric
                              {...compactSlidingParts(seg.value, locale)}
                            />
                          </span>
                          <span className={cn("text-[11px] tabular-nums", muted)}>
                            {sharePercent < 0.1 && seg.value > 0 ? (
                              "<0.1%"
                            ) : (
                              <SlidingMetric
                                {...percentSlidingParts(sharePercent, locale, 1)}
                              />
                            )}
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
      <div className="flex w-full flex-col gap-3">
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
              "flex h-[148px] w-full items-center justify-center text-xs sm:h-[164px]",
              muted,
            )}
          >
            {loading ? t("heatmap.loadingDescription") : t("heatmap.empty")}
          </div>
        ) : (
          // Extra height for month (top) + weekday (left) axis labels.
          <div className="relative h-[148px] w-full sm:h-[164px]">
            <DitherHeatmap
              weeks={ditherWeeks}
              theme={ditherTheme}
              monthLabels={heatmapMonthLabels}
              weekdayLabels={heatmapWeekdayLabels}
              onCellHover={({ weekIndex, dayIndex, clientX, clientY }) => {
                const cell = heatmapWeeks[weekIndex]?.cells[dayIndex];
                // Empty / out-of-year cells: keep last tip open and only chase the
                // pointer so gaps don't unmount SlidingMetric mid-scrub.
                if (!cell || cell.count === null || !cell.detail) {
                  setHeatmapTooltip((prev) =>
                    prev ? { ...prev, clientX, clientY } : null,
                  );
                  return;
                }
                const detail = cell.detail;
                const costUsd = detail.total_cost_usd ?? 0;
                // Match other token-usage tooltips: compact token counts (337M not 337483973).
                const costLine = {
                  label: t("heatmap.popover.cost"),
                  value: formatCurrencyCompact(detail.total_cost_usd, locale),
                  sliding: currencySlidingParts(costUsd, locale, "compact"),
                };
                const tokensLine = {
                  label: t("heatmap.popover.tokens"),
                  value: formatCompactNumber(detail.total_tokens, locale),
                  sliding: compactSlidingParts(detail.total_tokens, locale),
                };
                const primaryLines =
                  metric === "cost" ? [costLine, tokensLine] : [tokensLine, costLine];
                const countLine = (
                  label: string,
                  amount: number,
                ): {
                  label: string;
                  value: string;
                  sliding: SlidingMetricParts;
                } => ({
                  label,
                  value: formatCompactNumber(amount, locale),
                  sliding: compactSlidingParts(amount, locale),
                });
                const nextLines = [
                  ...primaryLines,
                  countLine(t("heatmap.popover.messages"), detail.message_count),
                  countLine(
                    t("heatmap.popover.input"),
                    detail.breakdown.input_tokens,
                  ),
                  countLine(
                    t("heatmap.popover.output"),
                    detail.breakdown.output_tokens,
                  ),
                  countLine(
                    t("heatmap.popover.cache"),
                    detail.breakdown.cache_read_tokens +
                      detail.breakdown.cache_write_tokens,
                  ),
                  countLine(
                    t("heatmap.popover.reasoning"),
                    detail.breakdown.reasoning_tokens,
                  ),
                ];
                const title = formatHeatmapDate(cell.date, locale);
                setHeatmapTooltip((prev) => {
                  // Same day: only move the shell — keep line object identity so
                  // DitherTooltip does not thrash content / remount digits.
                  if (
                    prev &&
                    prev.title === title &&
                    prev.lines.length === nextLines.length &&
                    prev.lines.every(
                      (line, i) =>
                        line.value === nextLines[i]?.value &&
                        line.label === nextLines[i]?.label,
                    )
                  ) {
                    if (prev.clientX === clientX && prev.clientY === clientY) {
                      return prev;
                    }
                    return { ...prev, clientX, clientY };
                  }
                  return {
                    clientX,
                    clientY,
                    title,
                    lines: nextLines,
                  };
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
                formatSliding={formatMetricSliding}
                domainKey={metric}
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
                  formatSliding={formatMetricSliding}
                  domainKey={metric}
                  totalLabel={t("charts.stacked.total")}
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
                      <span className="inline-flex size-3 shrink-0 items-center justify-center">
                        <IconSwap>
                          <IconSwapItem key={segmentId}>
                            {segmentIcons?.[index] ?? (
                              <span
                                className="size-1.5 shrink-0 rounded-full"
                                style={{ backgroundColor: color }}
                                aria-hidden
                              />
                            )}
                          </IconSwapItem>
                        </IconSwap>
                      </span>
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

