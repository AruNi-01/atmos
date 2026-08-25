"use client";

import React from "react";
import { useTranslations } from "next-intl";
import {
  Badge,
  ScrollArea,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@workspace/ui";
import { cn } from "@/shared/lib/utils";
import type { ResourceMonitorSnapshot } from "@atmos/api-types/ws/dto/resource-monitor";
import type { DesktopShellMetricsSnapshot } from "@/features/resource-monitor/lib/desktop-shell-metrics";
import { ResourceMonitorDiskSection } from "@/features/resource-monitor/components/ResourceMonitorDiskSection";
import { ResourceMonitorHierarchy } from "@/features/resource-monitor/components/ResourceMonitorHierarchy";
import { ResourceMonitorHostSection } from "@/features/resource-monitor/components/ResourceMonitorHostSection";
import { isUsageVisible } from "@/features/resource-monitor/lib/resource-monitor-format";
import type { ResourceHostHistoryPoint } from "@/features/resource-monitor/lib/resource-monitor-host-history";
import type { ResourceMonitorSessionNavigationTarget } from "@/features/resource-monitor/lib/resource-monitor-session-navigation";
import { buildResourceMonitorSessionDisplayMap } from "@/features/resource-monitor/lib/resource-monitor-session-titles";
import {
  defaultResourceMonitorSortDirection,
  type ResourceMonitorSortDirection,
  type ResourceMonitorSortKey,
} from "@/features/resource-monitor/lib/resource-monitor-sort";
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
  const liveDisplays = React.useMemo(
    () => buildResourceMonitorSessionDisplayMap(workspacePanes),
    [workspacePanes],
  );
  const [sort, setSort] = React.useState<{
    key: ResourceMonitorSortKey;
    direction: ResourceMonitorSortDirection;
  }>({ key: "cpu", direction: "descending" });
  const handleSortKeyChange = React.useCallback((key: ResourceMonitorSortKey) => {
    setSort((current) =>
      current.key === key
        ? {
            key,
            direction:
              current.direction === "ascending" ? "descending" : "ascending",
          }
        : { key, direction: defaultResourceMonitorSortDirection(key) },
    );
  }, []);
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
        className="flex max-h-[min(620px,calc(100vh-1.5rem))] min-h-0 min-w-0 flex-col overflow-hidden"
        data-resource-monitor-state={state}
      >
        <header className="shrink-0 px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xs font-medium text-foreground">{t("title")}</h3>
            <StatusBadges banners={banners} />
          </div>
        </header>

        <ScrollArea className="min-h-0 w-full max-w-full flex-1 overflow-x-hidden">
          <div className="min-w-0 max-w-full overflow-x-hidden pb-1">
            <ResourceMonitorHostSection
              host={showSnapshot ? snapshot?.host : undefined}
              isLoading={isLoading}
              history={history}
              nowMs={nowMs}
            />

            {showSnapshot && snapshot && snapshot.disks.length > 0 ? (
              <ResourceMonitorDiskSection disks={snapshot.disks} />
            ) : null}

            {showSnapshot && snapshot ? (
              <ResourceMonitorHierarchy
                sortKey={sort.key}
                sortDirection={sort.direction}
                onSortKeyChange={handleSortKeyChange}
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
                liveDisplays={liveDisplays}
                workspacePanes={workspacePanes}
                onNavigate={onNavigateSession}
              />
            ) : null}
          </div>
        </ScrollArea>
      </div>
    </TooltipProvider>
  );
}
