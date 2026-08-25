import { cn } from "@/shared/lib/utils";
import { RESOURCE_MONITOR_HIGH_USAGE_PERCENT } from "@/features/resource-monitor/lib/resource-monitor-constants";
import { clampPercent } from "@/features/resource-monitor/lib/resource-monitor-host-history";
import {
  RESOURCE_MONITOR_BAR_DURATION_MS,
  RESOURCE_MONITOR_BAR_EASING,
} from "@/features/resource-monitor/lib/resource-monitor-motion";

export function ResourceMonitorUsageBar({
  value,
  tone,
  className,
}: {
  value: number;
  tone: "cpu" | "memory";
  className?: string;
}) {
  const percent = clampPercent(value);
  const high = percent >= RESOURCE_MONITOR_HIGH_USAGE_PERCENT;
  return (
    <div
      className={cn("h-1 w-full overflow-hidden rounded-full bg-muted", className)}
      aria-hidden
    >
      <div
        className={cn(
          "h-full w-full origin-left transition-transform motion-reduce:transition-none",
          high ? "bg-warning" : tone === "cpu" ? "bg-info" : "bg-foreground/60",
        )}
        style={{
          transform: `scaleX(${percent / 100})`,
          transitionDuration: `${RESOURCE_MONITOR_BAR_DURATION_MS}ms`,
          transitionTimingFunction: RESOURCE_MONITOR_BAR_EASING,
        }}
      />
    </div>
  );
}
