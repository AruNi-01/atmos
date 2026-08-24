"use client";

import React from "react";
import { useTranslations } from "next-intl";
import {
  Badge,
  ScrollArea,
  Skeleton,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@workspace/ui";
import { cn } from "@/shared/lib/utils";
import type { ResourceMonitorSnapshot } from "@atmos/api-types/ws/dto/resource-monitor";
import type { DesktopShellMetricsSnapshot } from "@/features/resource-monitor/lib/desktop-shell-metrics";
import { ResourceMonitorHierarchy } from "@/features/resource-monitor/components/ResourceMonitorHierarchy";
import { ResourceMonitorHostChart } from "@/features/resource-monitor/components/ResourceMonitorHostChart";
import { ResourceMonitorUsageBar } from "@/features/resource-monitor/components/ResourceMonitorUsageBar";
import {
  formatCpuPercent,
  formatMemoryBytes,
  isUsageVisible,
} from "@/features/resource-monitor/lib/resource-monitor-format";
import type { ResourceHostHistoryPoint } from "@/features/resource-monitor/lib/resource-monitor-host-history";
import { hostMemoryPercent } from "@/features/resource-monitor/lib/resource-monitor-host-history";
import type { ResourceMonitorSessionNavigationTarget } from "@/features/resource-monitor/lib/resource-monitor-session-navigation";
import { buildResourceMonitorSessionTitleMap } from "@/features/resource-monitor/lib/resource-monitor-session-titles";
import { type ResourceMonitorSortKey } from "@/features/resource-monitor/lib/resource-monitor-sort";
import {
  resolveResourceMonitorUiState,
  resourceMonitorStatusBanners,
  resourceMonitorStatusTone,
  shouldRenderResourceMonitorSnapshot,
  shouldShowProjectsEmptyCopy,
  type ResourceMonitorStatusBanner,
  type ResourceMonitorStatusTone,
} from "@/features/resource-monitor/lib/resource-monitor-ui-state";
import { useTerminalStore } from "@/features/terminal/store/use-terminal-store";

const TONE_CLASS: Record<ResourceMonitorStatusTone, string> = {
  info: "border-info/30 bg-info/10 text-info",
  warning: "border-warning/30 bg-warning/10 text-warning",
  muted: "border-border bg-muted/40 text-muted-foreground",
  secondary: "border-transparent bg-secondary text-secondary-foreground",
  destructive: "border-destructive/30 bg-destructive/10 text-destructive",
};

function StatusBadges({ banners }: { banners: ResourceMonitorStatusBanner[] }) {
  const t = useTranslations("resourceMonitor.popover");
  if (banners.length === 0) return null;
  const short: Record<ResourceMonitorStatusBanner, string> = {
    loading: t("statusLoading"),
    disconnected: t("statusDisconnected"),
    unsupported: t("statusUnavailable"),
    stale: t("statusStale"),
    partial: t("statusPartial"),
    empty: t("statusEmpty"),
  };
  const detail: Record<ResourceMonitorStatusBanner, string> = {
    loading: t("loading"),
    disconnected: t("disconnected"),
    unsupported: t("unsupported"),
    stale: t("stale"),
    partial: t("partial"),
    empty: t("empty"),
  };
  return (
    <div role="status" aria-live="polite" className="flex flex-wrap gap-1">
      {banners.map((banner) => (
        <Tooltip key={banner}>
          <TooltipTrigger asChild>
            <span className="inline-flex">
              <Badge
                variant="outline"
                aria-label={detail[banner]}
                className={cn(
                  "text-[10px] font-medium",
                  TONE_CLASS[resourceMonitorStatusTone(banner)],
                )}
              >
                {short[banner]}
              </Badge>
            </span>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs">
            {detail[banner]}
          </TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
}

function HostMetricColumn({
  label,
  value,
  caption,
  barValue,
  tone,
}: {
  label: string;
  value: string;
  caption: string;
  barValue: number;
  tone: "cpu" | "memory";
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className="text-base font-semibold leading-none tabular-nums">{value}</p>
      <p className="min-h-[14px] truncate text-[10px] tabular-nums text-muted-foreground">
        {caption}
      </p>
      <ResourceMonitorUsageBar value={barValue} tone={tone} />
    </div>
  );
}

export function ResourceMonitorPopover({
  connectionState,
  isLoading,
  lastUpdatedAtMs,
  nowMs,
  snapshot,
  history = [],
  showDesktop,
  desktop,
  desktopLoading = false,
  onNavigateSession,
}: {
  connectionState: string;
  isLoading: boolean;
  lastUpdatedAtMs?: number;
  nowMs?: number;
  snapshot?: ResourceMonitorSnapshot;
  history?: readonly ResourceHostHistoryPoint[];
  showDesktop: boolean;
  desktop?: DesktopShellMetricsSnapshot;
  desktopLoading?: boolean;
  onNavigateSession?: (target: ResourceMonitorSessionNavigationTarget) => void;
}) {
  const t = useTranslations("resourceMonitor.popover");
  const workspacePanes = useTerminalStore((s) => s.workspacePanes);
  const liveTitles = React.useMemo(
    () => buildResourceMonitorSessionTitleMap(workspacePanes),
    [workspacePanes],
  );
  const [sortKey, setSortKey] = React.useState<ResourceMonitorSortKey>("cpu");
  const state = resolveResourceMonitorUiState({
    connectionState,
    isLoading,
    lastUpdatedAtMs,
    nowMs,
    snapshot,
  });
  const banners = resourceMonitorStatusBanners(state, snapshot);
  const showSnapshot = shouldRenderResourceMonitorSnapshot(state) && snapshot != null;
  const showUnattributed =
    showSnapshot &&
    snapshot != null &&
    (isUsageVisible(snapshot.unattributed) ||
      snapshot.attribution_status === "partial");

  return (
    <TooltipProvider delayDuration={250}>
      <div
        className="flex max-h-[min(520px,70vh)] min-w-0 flex-col overflow-hidden"
        data-resource-monitor-state={state}
      >
        <header className="shrink-0 space-y-2 border-b border-border px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xs font-medium text-foreground">{t("title")}</h3>
            <StatusBadges banners={banners} />
          </div>
        </header>

        <section className="shrink-0 space-y-2 border-b border-border px-3 py-2">
          <h4 className="text-[10px] font-medium text-muted-foreground">{t("host")}</h4>
          {showSnapshot && snapshot ? (
            <>
              <div
                className="grid grid-cols-2 gap-3"
                data-resource-monitor-host=""
              >
                <HostMetricColumn
                  label={t("cpu")}
                  value={formatCpuPercent(snapshot.host.cpu_percent)}
                  caption={t("logicalCpus", { count: snapshot.host.logical_cpu_count })}
                  barValue={snapshot.host.cpu_percent}
                  tone="cpu"
                />
                <HostMetricColumn
                  label={t("memory")}
                  value={formatMemoryBytes(snapshot.host.memory_used_bytes)}
                  caption={t("memoryOfTotal", {
                    total: formatMemoryBytes(snapshot.host.memory_total_bytes),
                  })}
                  barValue={hostMemoryPercent(
                    snapshot.host.memory_used_bytes,
                    snapshot.host.memory_total_bytes,
                  )}
                  tone="memory"
                />
              </div>
              <ResourceMonitorHostChart history={history} nowMs={nowMs} />
            </>
          ) : isLoading ? (
            <div className="grid grid-cols-2 gap-3" data-resource-monitor-host="">
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
            </div>
          ) : null}
        </section>

        {showSnapshot && snapshot ? (
          <ScrollArea className="h-[min(250px,38vh)]">
            <ResourceMonitorHierarchy
              sortKey={sortKey}
              onSortKeyChange={setSortKey}
              snapshotProjects={snapshot.projects}
              snapshotServer={snapshot.server}
              snapshotShared={snapshot.shared_runtime}
              snapshotUnattributed={snapshot.unattributed}
              showUnattributed={showUnattributed}
              showProjectsEmpty={shouldShowProjectsEmptyCopy(
                state,
                snapshot.projects.length,
              )}
              showDesktop={showDesktop}
              desktop={desktop}
              desktopLoading={desktopLoading}
              liveTitles={liveTitles}
              workspacePanes={workspacePanes}
              onNavigate={onNavigateSession}
            />
          </ScrollArea>
        ) : null}
      </div>
    </TooltipProvider>
  );
}
