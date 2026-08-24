"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Activity } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@workspace/ui";
import { useResourceMonitor } from "@/features/resource-monitor/hooks/use-resource-monitor";
import { ResourceMonitorPopover } from "@/features/resource-monitor/components/ResourceMonitorPopover";
import {
  formatCpuPercent,
  formatMemoryBytes,
} from "@/features/resource-monitor/lib/resource-monitor-format";

export function ResourceMonitorFooterItem() {
  const t = useTranslations("resourceMonitor.footerItem");
  const [open, setOpen] = React.useState(false);
  const {
    connectionState,
    showDesktop,
    snapshot,
    isLoading,
    lastUpdatedAtMs,
    nowMs,
    desktop,
    desktopLoading,
  } = useResourceMonitor({
    enabled: true,
    interactive: open,
  });

  const compact =
    connectionState === "connected" && snapshot
      ? t("compact", {
          cpu: formatCpuPercent(snapshot.host.cpu_percent),
          memory: formatMemoryBytes(snapshot.host.memory_used_bytes),
        })
      : t("compactUnavailable");

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground"
          title={t("title")}
          aria-label={t("title")}
          data-resource-monitor-footer=""
        >
          <Activity className="size-3" />
          <span className="font-medium">{compact}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        className="w-[min(420px,calc(100vw-1.5rem))] max-w-[min(420px,100vw)] p-0"
      >
        <ResourceMonitorPopover
          connectionState={connectionState}
          isLoading={isLoading}
          lastUpdatedAtMs={lastUpdatedAtMs}
          nowMs={nowMs}
          snapshot={snapshot}
          showDesktop={showDesktop}
          desktop={desktop}
          desktopLoading={desktopLoading}
        />
      </PopoverContent>
    </Popover>
  );
}
