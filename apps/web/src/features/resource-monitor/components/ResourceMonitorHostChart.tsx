"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { DitherGrowth, type DitherTooltipLine } from "@workspace/ui";
import {
  formatHostHistoryLocalTime,
  hostHistoryAgeSeconds,
  hostHistoryRelative,
} from "@/features/resource-monitor/lib/resource-monitor-chart-time";
import {
  formatMemoryBytes,
  formatMemoryPair,
  formatPercent,
} from "@/features/resource-monitor/lib/resource-monitor-format";
import type { ResourceHostHistoryPoint } from "@/features/resource-monitor/lib/resource-monitor-host-history";
import {
  resourceMonitorGrowthColorStops,
  resourceMonitorDitherTheme,
} from "@/features/resource-monitor/lib/resource-monitor-pressure";

const TRACK_HEIGHT_CLASS = "h-11";

function HostChartTrack({
  label,
  values,
  labels,
  yMax,
  formatValue,
  getTooltipLines,
  theme,
}: {
  label: string;
  values: number[];
  labels: string[];
  yMax: number;
  formatValue: (value: number) => string;
  getTooltipLines: (value: number, index: number) => DitherTooltipLine[];
  theme: "light" | "dark";
}) {
  return (
    <div className="min-w-0 space-y-0.5">
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <div className={`${TRACK_HEIGHT_CLASS} w-full`}>
        <DitherGrowth
          values={values}
          labels={labels}
          yMax={yMax}
          colorStops={resourceMonitorGrowthColorStops(theme, yMax)}
          compact
          theme={theme}
          valueLabel={label}
          formatValue={formatValue}
          getTooltipLines={getTooltipLines}
        />
      </div>
    </div>
  );
}

export function ResourceMonitorHostChart({
  history,
  logicalCpuCount,
  memoryTotalBytes,
  nowMs = 0,
}: {
  history: readonly ResourceHostHistoryPoint[];
  logicalCpuCount: number;
  memoryTotalBytes: number;
  nowMs?: number;
}) {
  const t = useTranslations("resourceMonitor.popover");
  const { resolvedTheme } = useTheme();
  const theme = resourceMonitorDitherTheme(resolvedTheme);
  const labels = React.useMemo(
    () =>
      history.map((point) => {
        const localTime = formatHostHistoryLocalTime(point.received_at_ms);
        const relative = hostHistoryRelative(
          hostHistoryAgeSeconds(point.received_at_ms, nowMs),
        );
        const relativeLabel =
          relative.kind === "now"
            ? t("chartJustNow")
            : relative.kind === "seconds"
              ? t("chartSecondsAgo", { count: relative.count })
              : t("chartMinutesAgo", { count: relative.count });
        return localTime ? `${localTime} · ${relativeLabel}` : relativeLabel;
      }),
    [history, nowMs, t],
  );
  if (history.length < 2) {
    return (
      <p
        className={`flex ${TRACK_HEIGHT_CLASS} items-center text-[11px] text-muted-foreground`}
        data-resource-monitor-collecting=""
      >
        {t("collectingSamples")}
      </p>
    );
  }

  return (
    <div
      role="img"
      aria-label={t("chartAriaLabel")}
      className="space-y-1.5"
      data-resource-monitor-chart=""
    >
      <HostChartTrack
        label={t("cpu")}
        values={history.map((point) => point.cpu_percent)}
        labels={labels}
        yMax={100}
        formatValue={formatPercent}
        getTooltipLines={(value) => [
          {
            label: t("used"),
            value: t("cpuUsageAmount", {
              used: ((value / 100) * logicalCpuCount).toFixed(1),
              total: logicalCpuCount,
            }),
          },
        ]}
        theme={theme}
      />
      <HostChartTrack
        label={t("memory")}
        values={history.map((point) => point.memory_percent)}
        labels={labels}
        yMax={100}
        formatValue={formatPercent}
        getTooltipLines={(value) => [
          {
            label: t("used"),
            value: formatMemoryPair(
              (value / 100) * memoryTotalBytes,
              memoryTotalBytes,
            ),
          },
          {
            label: t("available"),
            value: formatMemoryBytes((1 - value / 100) * memoryTotalBytes),
          },
        ]}
        theme={theme}
      />
    </div>
  );
}
