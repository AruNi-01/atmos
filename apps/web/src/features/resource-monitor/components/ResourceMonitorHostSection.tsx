"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { ChevronRight } from "lucide-react";
import {
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Popover,
  PopoverContent,
  PopoverTrigger,
  ServerGauge,
  Skeleton,
} from "@workspace/ui";
import { cn } from "@/shared/lib/utils";
import type {
  ResourceHostMetrics,
  ResourceMemoryAccounting,
} from "@atmos/api-types/ws/dto/resource-monitor";
import { ResourceMonitorHostChart } from "@/features/resource-monitor/components/ResourceMonitorHostChart";
import { ResourceMonitorUsageBar } from "@/features/resource-monitor/components/ResourceMonitorUsageBar";
import {
  RM_HOST_MEMORY,
  RM_HOST_METRIC,
  RM_NAME,
  RM_ROW,
  RM_ROW_INTERACTIVE,
} from "@/features/resource-monitor/lib/resource-monitor-classes";
import {
  formatCpuPercent,
  formatMemoryBytes,
  formatMemoryPair,
} from "@/features/resource-monitor/lib/resource-monitor-format";
import { hostDefaultOpen } from "@/features/resource-monitor/lib/resource-monitor-hierarchy";
import type { ResourceHostHistoryPoint } from "@/features/resource-monitor/lib/resource-monitor-host-history";
import { hostMemoryPercent } from "@/features/resource-monitor/lib/resource-monitor-host-history";
import {
  resourceMonitorDitherColor,
  resourceMonitorDitherTheme,
  resourceMonitorDitherTrackColor,
} from "@/features/resource-monitor/lib/resource-monitor-pressure";

function MemoryMeter({
  label,
  kind,
  value,
  total,
  unavailable,
}: {
  label: string;
  kind: "used" | "available" | "cached" | "free" | "swap";
  value: number | null;
  total: number;
  unavailable?: string;
}) {
  const missing = value == null;
  return (
    <div className="space-y-1" data-resource-monitor-memory-meter={kind}>
      <div className="flex items-baseline justify-between gap-2 text-[11px]">
        <span className="text-muted-foreground">{label}</span>
        <span className="tabular-nums text-foreground">
          {missing ? unavailable : formatMemoryPair(value, total)}
        </span>
      </div>
      {missing ? null : (
        <ResourceMonitorUsageBar
          value={hostMemoryPercent(value, total)}
          tone={kind === "used" || kind === "swap" ? "pressure" : "neutral"}
          label={label}
        />
      )}
    </div>
  );
}

function CpuDetailPanel({ host }: { host: ResourceHostMetrics }) {
  const t = useTranslations("resourceMonitor.popover");
  return (
    <div className="space-y-2">
      <p className="text-[11px] font-medium text-foreground">{t("cpuDetails")}</p>
      {host.cores.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">{t("unavailable")}</p>
      ) : (
        <div className="grid max-h-64 grid-cols-2 gap-x-3 gap-y-2 overflow-y-auto pr-1">
          {host.cores.map((core) => (
            <div
              key={core.index}
              className="space-y-1"
              data-resource-monitor-core={String(core.index)}
            >
              <div className="flex items-baseline justify-between gap-1 text-[11px]">
                <span className="text-muted-foreground">
                  {t("coreIndex", { index: core.index })}
                </span>
                <span className="tabular-nums">
                  {formatCpuPercent(core.cpu_percent)}
                </span>
              </div>
              <ResourceMonitorUsageBar
                value={core.cpu_percent}
                tone="pressure"
                label={t("coreIndex", { index: core.index })}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function accountingCaption(
  t: ReturnType<typeof useTranslations<"resourceMonitor.popover">>,
  accounting: ResourceMemoryAccounting,
): string {
  switch (accounting) {
    case "btop_mach":
      return t("accounting.btop_mach");
    case "linux_memavailable":
      return t("accounting.linux_memavailable");
    case "windows_avail_phys":
      return t("accounting.windows_avail_phys");
    case "fallback_total_minus_available":
      return t("accounting.fallback_total_minus_available");
  }
}

function MemoryDetailPanel({ host }: { host: ResourceHostMetrics }) {
  const t = useTranslations("resourceMonitor.popover");
  const memory = host.memory;
  return (
    <div className="space-y-2.5">
      <p className="text-[11px] font-medium text-foreground">{t("memoryDetails")}</p>
      <MemoryMeter
        kind="used"
        label={t("used")}
        value={memory.used_bytes}
        total={memory.total_bytes}
      />
      <MemoryMeter
        kind="available"
        label={t("available")}
        value={memory.available_bytes}
        total={memory.total_bytes}
      />
      <MemoryMeter
        kind="cached"
        label={t("cached")}
        value={memory.cached_bytes}
        total={memory.total_bytes}
        unavailable={t("unavailable")}
      />
      <MemoryMeter
        kind="free"
        label={t("free")}
        value={memory.free_bytes}
        total={memory.total_bytes}
      />
      <MemoryMeter
        kind="swap"
        label={t("swap")}
        value={memory.swap_used_bytes}
        total={memory.swap_total_bytes}
      />
      <p
        className="text-[10px] text-muted-foreground"
        data-resource-monitor-accounting={memory.accounting satisfies ResourceMemoryAccounting}
      >
        {accountingCaption(t, memory.accounting)}
      </p>
    </div>
  );
}

function focusDetailTrigger(kind: "cpu" | "memory") {
  document
    .querySelector<HTMLButtonElement>(`[data-resource-monitor-details="${kind}"]`)
    ?.focus();
}

function HostDetailPopover({
  kind,
  open,
  onOpenChange,
  triggerLabel,
  children,
}: {
  kind: "cpu" | "memory";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  triggerLabel: string;
  children: React.ReactNode;
}) {
  return (
    <Popover open={open} onOpenChange={onOpenChange} modal={false}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="secondary"
          size="xs"
          data-resource-monitor-details={kind}
          className="border-transparent"
        >
          {triggerLabel}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        data-resource-monitor-detail={kind}
        side="bottom"
        align="start"
        className="w-[min(320px,calc(100vw-2rem))] p-3"
        onOpenAutoFocus={() => undefined}
        onEscapeKeyDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onOpenChange(false);
          focusDetailTrigger(kind);
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          focusDetailTrigger(kind);
        }}
      >
        {children}
      </PopoverContent>
    </Popover>
  );
}

export function ResourceMonitorHostSection({
  host,
  isLoading,
  history,
  nowMs,
}: {
  host?: ResourceHostMetrics;
  isLoading: boolean;
  history: readonly ResourceHostHistoryPoint[];
  nowMs?: number;
}) {
  const t = useTranslations("resourceMonitor.popover");
  const { resolvedTheme } = useTheme();
  const ditherTheme = resourceMonitorDitherTheme(resolvedTheme);
  const [hostOpen, setHostOpen] = React.useState(hostDefaultOpen);
  const [cpuDetailOpen, setCpuDetailOpen] = React.useState(false);
  const [memoryDetailOpen, setMemoryDetailOpen] = React.useState(false);
  const handleHostOpenChange = React.useCallback((next: boolean) => {
    setHostOpen(next);
    if (!next) {
      setCpuDetailOpen(false);
      setMemoryDetailOpen(false);
    }
  }, []);

  const cpu = host ? formatCpuPercent(host.cpu_percent) : null;
  const memory = host ? formatMemoryBytes(host.memory_used_bytes) : null;
  const coresInline = host
    ? t("coresInline", { count: host.logical_cpu_count })
    : null;
  const ofTotal = host
    ? t("memoryOfTotal", { total: formatMemoryBytes(host.memory_total_bytes) })
    : null;
  const memoryPercent = host
    ? hostMemoryPercent(host.memory_used_bytes, host.memory_total_bytes)
    : 0;

  return (
    <Collapsible
      open={hostOpen}
      onOpenChange={handleHostOpenChange}
      className="min-w-0 w-full"
      data-resource-monitor-host=""
      data-resource-monitor-host-open={hostOpen ? "" : undefined}
    >
      <CollapsibleTrigger
        type="button"
        data-resource-monitor-host-trigger=""
        aria-label={hostOpen ? t("collapseHost") : t("expandHost")}
        className={cn(RM_ROW, RM_ROW_INTERACTIVE, "group min-w-0 text-left")}
      >
        <span className={cn(RM_NAME, "flex items-center gap-1")}>
          <ChevronRight className="size-3 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-90" />
          <span className="font-medium text-foreground">{t("host")}</span>
        </span>
        {cpu && coresInline ? (
          <span className={RM_HOST_METRIC}>
            {cpu}
            <span className="text-muted-foreground/80"> · {coresInline}</span>
          </span>
        ) : null}
        {memory && ofTotal ? (
          <span className={RM_HOST_MEMORY}>
            {memory}
            <span className="text-muted-foreground/80"> · {ofTotal}</span>
          </span>
        ) : null}
      </CollapsibleTrigger>
      <CollapsibleContent className="px-3 pb-2">
        {host ? (
          <div className="space-y-2 pt-1">
            <ServerGauge
              cpuPercent={host.cpu_percent}
              memoryPercent={memoryPercent}
              cpuLabel={t("cpu")}
              memoryLabel={t("memory")}
              cpuColor={resourceMonitorDitherColor(
                ditherTheme,
                "pressure",
                host.cpu_percent,
              )}
              memoryColor={resourceMonitorDitherColor(
                ditherTheme,
                "pressure",
                memoryPercent,
              )}
              trackColor={resourceMonitorDitherTrackColor(ditherTheme)}
              theme={ditherTheme}
              formatValue={formatCpuPercent}
            />
            <ResourceMonitorHostChart
              history={history}
              logicalCpuCount={host.logical_cpu_count}
              memoryTotalBytes={host.memory_total_bytes}
              nowMs={nowMs}
            />
            <div className="flex flex-wrap justify-end gap-2">
              <HostDetailPopover
                kind="cpu"
                open={cpuDetailOpen}
                onOpenChange={setCpuDetailOpen}
                triggerLabel={t("cpuDetails")}
              >
                <CpuDetailPanel host={host} />
              </HostDetailPopover>
              <HostDetailPopover
                kind="memory"
                open={memoryDetailOpen}
                onOpenChange={setMemoryDetailOpen}
                triggerLabel={t("memoryDetails")}
              >
                <MemoryDetailPanel host={host} />
              </HostDetailPopover>
            </div>
          </div>
        ) : isLoading ? (
          <div className="grid grid-cols-2 gap-3 pt-1">
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
          </div>
        ) : null}
      </CollapsibleContent>
    </Collapsible>
  );
}
