"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { DitherRevenueLines } from "@workspace/ui";
import {
  formatHostHistoryLocalTime,
  hostHistoryAgeSeconds,
  hostHistoryRelative,
} from "@/features/resource-monitor/lib/resource-monitor-chart-time";
import { formatPercent } from "@/features/resource-monitor/lib/resource-monitor-format";
import type { ResourceHostHistoryPoint } from "@/features/resource-monitor/lib/resource-monitor-host-history";
import {
  resourceMonitorDitherColor,
  resourceMonitorDitherTheme,
} from "@/features/resource-monitor/lib/resource-monitor-pressure";

const TRACK_HEIGHT_CLASS = "h-9";

function HostChartTrack({
  seriesId,
  label,
  values,
  labels,
  color,
  theme,
}: {
  seriesId: string;
  label: string;
  values: number[];
  labels: string[];
  color: string;
  theme: "light" | "dark";
}) {
  return (
    <div className="min-w-0 space-y-0.5">
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <div className={`${TRACK_HEIGHT_CLASS} w-full`}>
        <DitherRevenueLines
          series={[
            {
              id: seriesId,
              values,
              color,
              label,
            },
          ]}
          labels={labels}
          yMax={100}
          theme={theme}
          formatValue={formatPercent}
        />
      </div>
    </div>
  );
}

export function ResourceMonitorHostChart({
  history,
  nowMs = 0,
}: {
  history: readonly ResourceHostHistoryPoint[];
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
  const latest = history.at(-1);

  if (history.length < 2 || latest == null) {
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
        seriesId="cpu"
        label={t("cpu")}
        values={history.map((point) => point.cpu_percent)}
        labels={labels}
        color={resourceMonitorDitherColor(theme, "pressure", latest.cpu_percent)}
        theme={theme}
      />
      <HostChartTrack
        seriesId="memory"
        label={t("memory")}
        values={history.map((point) => point.memory_percent)}
        labels={labels}
        color={resourceMonitorDitherColor(
          theme,
          "pressure",
          latest.memory_percent,
        )}
        theme={theme}
      />
    </div>
  );
}
