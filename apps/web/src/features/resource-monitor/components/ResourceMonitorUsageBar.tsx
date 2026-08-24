import { cn } from "@/shared/lib/utils";
import { RESOURCE_MONITOR_HIGH_USAGE_PERCENT } from "@/features/resource-monitor/lib/resource-monitor-constants";
import { clampPercent } from "@/features/resource-monitor/lib/resource-monitor-host-history";

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
          "h-full",
          high ? "bg-warning" : tone === "cpu" ? "bg-info" : "bg-foreground/60",
        )}
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}
