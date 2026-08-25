"use client";

import React from "react";
import { useLocale, useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import {
  DitherGrowth,
  type DitherTooltipLine,
  type DitherTooltipSliding,
} from "@workspace/ui";
import {
  formatHostHistoryLocalTime,
  hostHistoryAgeSeconds,
  hostHistoryRelative,
} from "@/features/resource-monitor/lib/resource-monitor-chart-time";
import {
  formatMemoryBytes,
  formatMemoryPair,
  formatPercent,
  hostPercentSlidingParts,
  memoryBytesSlidingParts,
  memoryPairSlidingParts,
  slidingPartsFromFormatted,
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
  formatSliding,
  getTooltipLines,
  theme,
}: {
  label: string;
  values: number[];
  labels: string[];
  yMax: number;
  formatValue: (value: number) => string;
  formatSliding: (value: number) => DitherTooltipSliding;
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
          formatSliding={formatSliding}
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
  const locale = useLocale();
  const { resolvedTheme } = useTheme();
  const theme = resourceMonitorDitherTheme(resolvedTheme);
  const formatSliding = React.useCallback(
    (value: number) => hostPercentSlidingParts(value, locale),
    [locale],
  );
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
        formatSliding={formatSliding}
        getTooltipLines={(value) => {
          const usedCores = (value / 100) * logicalCpuCount;
          const usedLabel = usedCores.toFixed(1);
          const formatted = t("cpuUsageAmount", {
            used: usedLabel,
            total: logicalCpuCount,
          });
          return [
            {
              label: t("used"),
              value: formatted,
              sliding: slidingPartsFromFormatted(
                formatted,
                usedCores,
                1,
                locale,
              ),
            },
          ];
        }}
        theme={theme}
      />
      <HostChartTrack
        label={t("memory")}
        values={history.map((point) => point.memory_percent)}
        labels={labels}
        yMax={100}
        formatValue={formatPercent}
        formatSliding={formatSliding}
        getTooltipLines={(value) => {
          const usedBytes = (value / 100) * memoryTotalBytes;
          const availableBytes = (1 - value / 100) * memoryTotalBytes;
          return [
            {
              label: t("used"),
              value: formatMemoryPair(usedBytes, memoryTotalBytes),
              sliding: memoryPairSlidingParts(
                usedBytes,
                memoryTotalBytes,
                locale,
              ),
            },
            {
              label: t("available"),
              value: formatMemoryBytes(availableBytes),
              sliding: memoryBytesSlidingParts(availableBytes, locale),
            },
          ];
        }}
        theme={theme}
      />
    </div>
  );
}
