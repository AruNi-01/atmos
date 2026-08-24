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
  formatMemoryBytes,
} from "@/features/resource-monitor/lib/resource-monitor-format";
import { preventResourceMonitorCloseAutoFocus } from "@/features/resource-monitor/lib/resource-monitor-close-autofocus";
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

  const compact =
    connectionState === "connected" && snapshot
      ? t("compact", {
          cpu: formatCpuPercent(snapshot.host.cpu_percent),
          memory: formatMemoryBytes(snapshot.host.memory_used_bytes),
        })
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
                aria-label={t("title")}
                data-resource-monitor-footer=""
              >
                <Activity className="size-3" />
                <span className="font-medium">{compact}</span>
              </button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent side="top">{t("title")}</TooltipContent>
        </Tooltip>
        <PopoverContent
          side="top"
          align="start"
          className="w-[min(400px,calc(100vw-1.5rem))] max-w-[min(400px,100vw)] overflow-hidden p-0"
          onCloseAutoFocus={(event) => {
            preventResourceMonitorCloseAutoFocus(navigatingRef, event);
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
