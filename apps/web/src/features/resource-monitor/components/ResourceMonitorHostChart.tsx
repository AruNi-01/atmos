"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  formatHostHistoryLocalTime,
  hostHistoryAgeSeconds,
  hostHistoryRelative,
} from "@/features/resource-monitor/lib/resource-monitor-chart-time";
import { formatPercent } from "@/features/resource-monitor/lib/resource-monitor-format";
import type { ResourceHostHistoryPoint } from "@/features/resource-monitor/lib/resource-monitor-host-history";

const CHART_HEIGHT_CLASS = "h-[52px]";

function HostTrendTooltip({
  active,
  payload,
  label,
  nowMs,
}: {
  active?: boolean;
  payload?: Array<{ dataKey?: string | number; value?: number }>;
  label?: string | number;
  nowMs: number;
}) {
  const t = useTranslations("resourceMonitor.popover");
  if (!active || !payload?.length) return null;
  const receivedAtMs = typeof label === "number" ? label : Number(label);
  const localTime = formatHostHistoryLocalTime(receivedAtMs);
  const relative = hostHistoryRelative(hostHistoryAgeSeconds(receivedAtMs, nowMs));
  const relativeLabel =
    relative.kind === "now"
      ? t("chartJustNow")
      : relative.kind === "seconds"
        ? t("chartSecondsAgo", { count: relative.count })
        : t("chartMinutesAgo", { count: relative.count });
  const cpu = payload.find((item) => item.dataKey === "cpu_percent")?.value;
  const memory = payload.find((item) => item.dataKey === "memory_percent")?.value;
  return (
    <div className="rounded-md border border-border bg-popover px-2 py-1.5 text-[11px] text-popover-foreground shadow-md">
      {localTime ? (
        <div className="text-muted-foreground">
          {localTime} · {relativeLabel}
        </div>
      ) : null}
      {cpu != null ? <div>{t("chartCpu", { value: formatPercent(cpu) })}</div> : null}
      {memory != null ? (
        <div>{t("chartMemory", { value: formatPercent(memory) })}</div>
      ) : null}
    </div>
  );
}

function ChartLegend() {
  const t = useTranslations("resourceMonitor.popover");
  return (
    <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
      <span className="inline-flex items-center gap-1">
        <span className="size-2.5 rounded-[2px] bg-info" aria-hidden />
        {t("cpu")}
      </span>
      <span className="inline-flex items-center gap-1">
        <span className="size-2.5 rounded-[2px] bg-foreground/60" aria-hidden />
        {t("memory")}
      </span>
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
  const chartData = React.useMemo(() => [...history], [history]);

  if (chartData.length < 2) {
    return (
      <p
        className={`flex ${CHART_HEIGHT_CLASS} items-center text-[11px] text-muted-foreground`}
        data-resource-monitor-collecting=""
      >
        {t("collectingSamples")}
      </p>
    );
  }

  return (
    <div className="space-y-1">
      <ChartLegend />
      <div
        role="img"
        aria-label={t("chartAriaLabel")}
        className={`${CHART_HEIGHT_CLASS} w-full`}
        data-resource-monitor-chart=""
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 4, right: 4, bottom: 2, left: 4 }}>
            <XAxis
              dataKey="received_at_ms"
              type="number"
              domain={["dataMin", "dataMax"]}
              hide
            />
            <YAxis domain={[0, 100]} hide />
            <Tooltip
              content={<HostTrendTooltip nowMs={nowMs} />}
              isAnimationActive={false}
              allowEscapeViewBox={{ x: true, y: true }}
              cursor={{ stroke: "var(--color-border)" }}
              wrapperStyle={{ zIndex: 20, pointerEvents: "none" }}
            />
            <Line
              type="monotone"
              dataKey="cpu_percent"
              stroke="var(--color-info)"
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
              name={t("cpu")}
            />
            <Line
              type="monotone"
              dataKey="memory_percent"
              stroke="var(--color-foreground)"
              strokeOpacity={0.55}
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
              name={t("memory")}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
