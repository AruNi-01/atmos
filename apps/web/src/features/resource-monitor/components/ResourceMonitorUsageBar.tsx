"use client";

import { DitherFunnel } from "@workspace/ui";
import { useTheme } from "next-themes";
import { cn } from "@/shared/lib/utils";
import { clampPercent } from "@/features/resource-monitor/lib/resource-monitor-host-history";
import {
  resourceMonitorDitherColor,
  resourceMonitorDitherTheme,
  type ResourceMonitorMeterTone,
} from "@/features/resource-monitor/lib/resource-monitor-pressure";

export function ResourceMonitorUsageBar({
  value,
  tone,
  label,
  className,
}: {
  value: number;
  tone: ResourceMonitorMeterTone;
  label: string;
  className?: string;
}) {
  const { resolvedTheme } = useTheme();
  const theme = resourceMonitorDitherTheme(resolvedTheme);
  const percent = clampPercent(value);
  const color = resourceMonitorDitherColor(theme, tone, percent);
  return (
    <div
      className={cn("h-2 w-full", className)}
      data-resource-monitor-usage-bar=""
      data-resource-monitor-meter-tone={tone}
      aria-hidden
    >
      <DitherFunnel
        stages={[
          {
            label,
            value: percent / 100,
            color,
          },
        ]}
        maxValue={1}
        gap={0}
        theme={theme}
      />
    </div>
  );
}
