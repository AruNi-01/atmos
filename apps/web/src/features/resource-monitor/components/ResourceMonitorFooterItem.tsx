"use client";

import React from "react";
import { useLocale, useTranslations } from "next-intl";
import { Activity } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
  SlidingMetric,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@workspace/ui";
import { useResourceMonitor } from "@/features/resource-monitor/hooks/use-resource-monitor";
import { ResourceMonitorPopover } from "@/features/resource-monitor/components/ResourceMonitorPopover";
import {
  formatPercent,
  hostPercentSlidingParts,
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

const FOOTER_SWAP_EASE = [0.22, 1, 0.36, 1] as const;
const FOOTER_SWAP_TRANSITION = { duration: 0.2, ease: FOOTER_SWAP_EASE } as const;

export function ResourceMonitorFooterItem() {
  const t = useTranslations("resourceMonitor.footerItem");
  const locale = useLocale();
  const [open, setOpen] = React.useState(false);
  const [previewing, setPreviewing] = React.useState(false);
  const reducedMotion = useReducedMotion();
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
          cpu: formatPercent(hostCpuPercent),
          memory: formatPercent(hostMemoryUsagePercent),
        }
      : null;
  const compactAria = compact
    ? t("compact", compact)
    : t("compactUnavailable");
  const labelText = t("monitor");
  const labelMeasureRef = React.useRef<HTMLSpanElement>(null);
  const usageMeasureRef = React.useRef<HTMLSpanElement>(null);
  const [labelWidth, setLabelWidth] = React.useState(0);
  const [usageWidth, setUsageWidth] = React.useState(0);

  const usageContent = compact ? (
    <>
      <span
        className={resourceMonitorPressureTextClass(
          resourceMonitorPressureTone(hostCpuPercent),
        )}
      >
        {t.rich("cpuValue", {
          value: () => (
            <SlidingMetric
              {...hostPercentSlidingParts(hostCpuPercent, locale)}
              className="text-inherit"
            />
          ),
        })}
      </span>
      <span className="text-muted-foreground/60">·</span>
      <span
        className={resourceMonitorPressureTextClass(
          resourceMonitorPressureTone(hostMemoryUsagePercent),
        )}
      >
        {t.rich("memoryValue", {
          value: () => (
            <SlidingMetric
              {...hostPercentSlidingParts(hostMemoryUsagePercent, locale)}
              className="text-inherit"
            />
          ),
        })}
      </span>
    </>
  ) : (
    compactAria
  );

  React.useLayoutEffect(() => {
    const labelEl = labelMeasureRef.current;
    const usageEl = usageMeasureRef.current;
    const update = () => {
      const nextLabel = labelEl?.scrollWidth ?? 0;
      const nextUsage = usageEl?.scrollWidth ?? 0;
      if (nextLabel > 0) setLabelWidth(nextLabel);
      if (nextUsage > 0) setUsageWidth(nextUsage);
    };
    update();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    if (labelEl) observer.observe(labelEl);
    if (usageEl) observer.observe(usageEl);
    return () => observer.disconnect();
  }, [compactAria, labelText, compact?.cpu, compact?.memory]);

  const contentWidth = previewing
    ? usageWidth || labelWidth
    : labelWidth;

  const handleOpenChange = React.useCallback((next: boolean) => {
    if (next && navigatingRef.current) return;
    setOpen(next);
  }, []);

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
      <Popover open={open} onOpenChange={handleOpenChange}>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="relative inline-flex h-5 items-center gap-1.5 overflow-hidden text-muted-foreground hover:text-foreground"
                aria-label={`${t("title")}: ${compactAria}`}
                data-resource-monitor-footer=""
                onMouseEnter={() => setPreviewing(true)}
                onMouseLeave={() => setPreviewing(false)}
                onFocus={() => setPreviewing(true)}
                onBlur={() => setPreviewing(false)}
              >
                <Activity className="size-3" />
                <span
                  aria-hidden
                  className="pointer-events-none invisible absolute left-0 top-0 flex gap-6 whitespace-nowrap font-medium"
                  data-resource-monitor-footer-measure=""
                >
                  <span ref={labelMeasureRef} className="inline-block">
                    {labelText}
                  </span>
                  <span
                    ref={usageMeasureRef}
                    className="inline-flex items-center gap-1"
                  >
                    {usageContent}
                  </span>
                </span>
                <motion.span
                  initial={false}
                  animate={contentWidth > 0 ? { width: contentWidth } : undefined}
                  transition={
                    reducedMotion
                      ? { duration: 0 }
                      : {
                          type: "spring",
                          stiffness: 420,
                          damping: 38,
                          mass: 0.7,
                        }
                  }
                  className="relative h-4 shrink-0 overflow-hidden"
                  data-resource-monitor-footer-content=""
                >
                  <span
                    aria-hidden
                    className="invisible inline-flex items-center gap-1 whitespace-nowrap font-medium"
                  >
                    {previewing ? usageContent : labelText}
                  </span>
                  <AnimatePresence initial={false} mode="wait">
                    {previewing ? (
                      <motion.span
                        key="usage"
                        initial={reducedMotion ? false : { opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={reducedMotion ? undefined : { opacity: 0, y: -6 }}
                        transition={
                          reducedMotion
                            ? { duration: 0 }
                            : FOOTER_SWAP_TRANSITION
                        }
                        className="absolute inset-0 inline-flex items-center gap-1 whitespace-nowrap font-medium"
                        data-resource-monitor-footer-usage=""
                      >
                        {usageContent}
                      </motion.span>
                    ) : (
                      <motion.span
                        key="label"
                        initial={reducedMotion ? false : { opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={reducedMotion ? undefined : { opacity: 0, y: -6 }}
                        transition={
                          reducedMotion
                            ? { duration: 0 }
                            : FOOTER_SWAP_TRANSITION
                        }
                        className="absolute inset-0 inline-flex items-center whitespace-nowrap font-medium"
                        data-resource-monitor-footer-label=""
                      >
                        {labelText}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </motion.span>
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
