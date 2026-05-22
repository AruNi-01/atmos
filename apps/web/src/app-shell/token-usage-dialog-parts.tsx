"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import {
  CalendarRange,
  Coins,
  LoaderCircle,
  MessagesSquare,
  RotateCw,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";

import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Skeleton,
  TextScramble,
} from "@workspace/ui";

import type { TokenUsageOverviewResponse } from "@/api/rest-api";
import {
  HEATMAP_DAY_LABEL_WIDTH,
  formatCompactNumber,
  formatCurrencyCompact,
  formatDetailedNumber,
  formatHeatmapDate,
  formatPercent,
  type HeatmapHoverState,
} from "@/app-shell/token-usage-dialog-utils";

export function TokenUsageDialogHeader({
  generatedAtLabel,
  loading,
  overview,
  refreshing,
  onClose,
  onRefresh,
}: {
  generatedAtLabel: string;
  loading: boolean;
  overview: TokenUsageOverviewResponse | null;
  refreshing: boolean;
  onClose: () => void;
  onRefresh: () => void;
}) {
  return (
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
              The heatmap is filtered by year. Summary cards and the charts below stay on all-time
              local session history rather than provider quota APIs.
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
            onClick={onRefresh}
            disabled={loading || refreshing}
          >
            {refreshing ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <RotateCw className="size-4" />
            )}
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="size-10 rounded-lg border-border/70 bg-background/80 backdrop-blur"
            onClick={onClose}
          >
            <X className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

export function TokenUsageStatCards({
  overview,
  rangeLabel,
  showInitialSkeleton,
}: {
  overview: TokenUsageOverviewResponse | null;
  rangeLabel: string;
  showInitialSkeleton: boolean;
}) {
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

  return (
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {showInitialSkeleton
        ? Array.from({ length: 4 }, (_, index) => (
            <TokenUsageStatSkeleton key={`stat-skeleton-${index}`} />
          ))
        : statCards.map((stat) => <TokenUsageStatCard key={stat.label} stat={stat} />)}
    </section>
  );
}

export function HeatmapSkeleton() {
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

export function ChartSkeleton() {
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

export function HeatmapHoverPopover({
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
            value={detail.breakdown.cache_read_tokens + detail.breakdown.cache_write_tokens}
          />
          <HeatmapPopoverRow label="Reasoning" value={detail.breakdown.reasoning_tokens} />
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function RadarShareTooltipContent({
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
        <div className="text-sm font-semibold tabular-nums">{formatPercent(rawValue / 100)}</div>
      </div>
    </div>
  );
}

function TokenUsageStatSkeleton() {
  return (
    <Card className="overflow-hidden border-border/70 bg-card/85 shadow-none backdrop-blur">
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
  );
}

function TokenUsageStatCard({
  stat,
}: {
  stat: {
    label: string;
    value: string;
    note: string;
    icon: LucideIcon;
  };
}) {
  return (
    <Card className="overflow-hidden border-border/70 bg-card/85 shadow-none backdrop-blur">
      <CardHeader className="space-y-3 pb-3">
        <div className="flex items-center justify-between">
          <CardDescription className="text-[11px] tracking-[0.08em] text-muted-foreground">
            {stat.label}
          </CardDescription>
          <div className="rounded-full border border-border/70 bg-muted/55 p-2 text-foreground">
            <stat.icon className="size-4" />
          </div>
        </div>
        <CardTitle className="text-3xl font-semibold tracking-tight">{stat.value}</CardTitle>
      </CardHeader>
      <CardContent>
        <span className="text-xs text-muted-foreground">{stat.note}</span>
      </CardContent>
    </Card>
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
