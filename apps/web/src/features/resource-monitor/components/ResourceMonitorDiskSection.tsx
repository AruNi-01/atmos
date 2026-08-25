"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { ChevronRight, HardDrive } from "lucide-react";
import {
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@workspace/ui";
import { cn } from "@/shared/lib/utils";
import type { ResourceDiskMetrics } from "@atmos/api-types/ws/dto/resource-monitor";
import { ResourceMonitorUsageBar } from "@/features/resource-monitor/components/ResourceMonitorUsageBar";
import {
  RM_HOST_MEMORY,
  RM_HOST_METRIC,
  RM_NAME,
  RM_ROW,
  RM_ROW_INTERACTIVE,
} from "@/features/resource-monitor/lib/resource-monitor-classes";
import {
  diskDefaultOpen,
  resourceMonitorDiskSummary,
} from "@/features/resource-monitor/lib/resource-monitor-disks";
import {
  formatMemoryBytes,
  formatPercent,
} from "@/features/resource-monitor/lib/resource-monitor-format";

export function ResourceMonitorDiskSection({
  disks,
  onOpenDiskAnalyzer,
}: {
  disks: readonly ResourceDiskMetrics[];
  onOpenDiskAnalyzer?: () => void;
}) {
  const t = useTranslations("resourceMonitor.popover");
  const [open, setOpen] = React.useState(diskDefaultOpen);
  const disk = resourceMonitorDiskSummary(disks);

  if (disk == null) return null;

  const percent = formatPercent(disk.usage_percent);
  const used = formatMemoryBytes(disk.used_bytes);
  const ofTotal = t("memoryOfTotal", {
    total: formatMemoryBytes(disk.total_bytes),
  });

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="min-w-0 w-full"
      data-resource-monitor-disk=""
      data-resource-monitor-disk-open={open ? "" : undefined}
    >
      <CollapsibleTrigger
        type="button"
        data-resource-monitor-disk-trigger=""
        aria-label={open ? t("collapseDisk") : t("expandDisk")}
        className={cn(RM_ROW, RM_ROW_INTERACTIVE, "group min-w-0 text-left")}
      >
        <span className={cn(RM_NAME, "flex items-center gap-1")}>
          <ChevronRight className="size-3 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-90" />
          <span className="font-medium text-foreground">{t("disk")}</span>
        </span>
        <span
          className={RM_HOST_METRIC}
          data-resource-monitor-disk-summary=""
        >
          {percent}
        </span>
        <span className={RM_HOST_MEMORY}>
          {used}
          <span className="text-muted-foreground/80"> · {ofTotal}</span>
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent className="px-3 pb-2">
        <div
          className="min-w-0 space-y-1 pt-1"
          data-resource-monitor-disk-row=""
          data-resource-monitor-disk-mount={disk.mount_point}
        >
          <div className="flex min-w-0 items-baseline justify-between gap-2 text-[11px]">
            <span className="min-w-0 truncate font-medium text-foreground">
              {disk.name}
            </span>
            <span className="shrink-0 tabular-nums text-foreground">
              {formatPercent(disk.usage_percent)}
            </span>
          </div>
          <p className="truncate text-[10px] text-muted-foreground">
            {disk.mount_point}
          </p>
          <p className="text-[11px] tabular-nums text-muted-foreground">
            {t("used")} {formatMemoryBytes(disk.used_bytes)} /{" "}
            {formatMemoryBytes(disk.total_bytes)}
            <span className="text-muted-foreground/80">
              {" "}
              · {t("available")} {formatMemoryBytes(disk.available_bytes)}
            </span>
          </p>
          <ResourceMonitorUsageBar
            value={disk.usage_percent}
            tone="pressure"
            label={disk.name}
            className="h-2.5"
          />
          {onOpenDiskAnalyzer ? (
            <div className="flex justify-end pt-1">
              <Button
                type="button"
                size="xs"
                variant="secondary"
                className="border-transparent"
                data-resource-monitor-disk-analyzer=""
                onClick={onOpenDiskAnalyzer}
              >
                <HardDrive aria-hidden />
                {t("diskAnalysis")}
              </Button>
            </div>
          ) : null}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
