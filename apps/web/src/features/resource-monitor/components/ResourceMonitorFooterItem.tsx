"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Activity } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@workspace/ui";
import { useResourceMonitor } from "@/features/resource-monitor/hooks/use-resource-monitor";
import { ResourceMonitorPopover } from "@/features/resource-monitor/components/ResourceMonitorPopover";
import {
  formatCpuPercent,
  formatPercent,
} from "@/features/resource-monitor/lib/resource-monitor-format";
import { hostMemoryPercent } from "@/features/resource-monitor/lib/resource-monitor-host-history";
import {
  resourceMonitorPressureTextClass,
  resourceMonitorPressureTone,
} from "@/features/resource-monitor/lib/resource-monitor-pressure";
import {
  isResourceMonitorDetailOpen,
  preventResourceMonitorCloseAutoFocus,
  preventResourceMonitorParentDismiss,
  preventResourceMonitorParentEscape,
} from "@/features/resource-monitor/lib/resource-monitor-close-autofocus";
import {
  runResourceMonitorSessionNavigation,
  type ResourceMonitorSessionNavigationTarget,
} from "@/features/resource-monitor/lib/resource-monitor-session-navigation";
import { useAppRouter } from "@/shared/hooks/use-app-router";

export function ResourceMonitorFooterItem() {
  const t = useTranslations("resourceMonitor.footerItem");
  const [open, setOpen] = React.useState(false);
  const navigatingRef = React.useRef(false);
  const router = useAppRouter();
  const {
    connectionState,
    showDesktop,
    snapshot,
    isLoading,
    lastUpdatedAtMs,
    nowMs,
    history,
    desktop,
    desktopLoading,
  } = useResourceMonitor({
    enabled: true,
    interactive: open,
  });

  const hostCpuPercent = snapshot?.host.cpu_percent ?? 0;
  const hostMemoryUsagePercent = snapshot
    ? hostMemoryPercent(
        snapshot.host.memory_used_bytes,
        snapshot.host.memory_total_bytes,
      )
    : 0;
  const compact =
    connectionState === "connected" && snapshot
      ? {
          cpu: formatCpuPercent(hostCpuPercent),
          memory: formatPercent(hostMemoryUsagePercent),
        }
      : null;
  const compactAria = compact
    ? t("compact", compact)
    : t("compactUnavailable");

  const handleSessionNavigate = React.useCallback(
    (target: ResourceMonitorSessionNavigationTarget) => {
      void runResourceMonitorSessionNavigation({
        target,
        router,
        markNavigating: () => {
          navigatingRef.current = true;
        },
        close: () => setOpen(false),
        reopen: () => setOpen(true),
      });
    },
    [router],
  );
  return (
    <TooltipProvider delayDuration={250}>
      <Popover open={open} onOpenChange={setOpen}>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground"
                aria-label={`${t("title")}: ${compactAria}`}
                data-resource-monitor-footer=""
              >
                <Activity className="size-3" />
                {compact ? (
                  <span className="inline-flex items-center gap-1 font-medium">
                    <span
                      className={resourceMonitorPressureTextClass(
                        resourceMonitorPressureTone(hostCpuPercent),
                      )}
                    >
                      {t("cpuValue", { value: compact.cpu })}
                    </span>
                    <span className="text-muted-foreground/60">·</span>
                    <span
                      className={resourceMonitorPressureTextClass(
                        resourceMonitorPressureTone(hostMemoryUsagePercent),
                      )}
                    >
                      {t("memoryValue", { value: compact.memory })}
                    </span>
                  </span>
                ) : (
                  <span className="font-medium">{compactAria}</span>
                )}
              </button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent side="top">{t("title")}</TooltipContent>
        </Tooltip>
        <PopoverContent
          side="top"
          align="start"
          className="w-[clamp(24rem,42vw,32rem)] max-w-[calc(100vw-1.5rem)] overflow-hidden p-0"
          onCloseAutoFocus={(event) => {
            preventResourceMonitorCloseAutoFocus(navigatingRef, event);
          }}
          onPointerDownOutside={(event) => {
            preventResourceMonitorParentDismiss(event);
          }}
          onFocusOutside={(event) => {
            preventResourceMonitorParentDismiss(event);
          }}
          onInteractOutside={(event) => {
            preventResourceMonitorParentDismiss(event);
          }}
          onEscapeKeyDown={(event) => {
            preventResourceMonitorParentEscape(event, isResourceMonitorDetailOpen());
          }}
        >
          <ResourceMonitorPopover
            connectionState={connectionState}
            isLoading={isLoading}
            lastUpdatedAtMs={lastUpdatedAtMs}
            nowMs={nowMs}
            snapshot={snapshot}
            history={history}
            showDesktop={showDesktop}
            desktop={desktop}
            desktopLoading={desktopLoading}
            onNavigateSession={handleSessionNavigate}
          />
        </PopoverContent>
      </Popover>
    </TooltipProvider>
  );
}
