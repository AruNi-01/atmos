"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { ChevronRight } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@workspace/ui";
import type {
  ResourceMonitorSnapshot,
  ResourceProjectMetrics,
  ResourceUsage,
  ResourceWorkspaceMetrics,
} from "@atmos/api-types/ws/dto/resource-monitor";
import type { DesktopShellMetricsSnapshot } from "@/features/resource-monitor/lib/desktop-shell-metrics";
import {
  formatCpuPercent,
  formatMemoryBytes,
  formatMemoryPair,
  isUsageVisible,
} from "@/features/resource-monitor/lib/resource-monitor-format";
import {
  resolveResourceMonitorUiState,
  type ResourceMonitorUiState,
} from "@/features/resource-monitor/lib/resource-monitor-ui-state";

function UsageCells({ usage }: { usage: ResourceUsage }) {
  return (
    <span className="tabular-nums text-muted-foreground">
      {formatCpuPercent(usage.cpu_percent)}
      <span className="mx-1 text-border">·</span>
      {formatMemoryBytes(usage.memory_rss_bytes)}
    </span>
  );
}

function MetricRow({
  label,
  usage,
  indent = 0,
}: {
  label: string;
  usage: ResourceUsage;
  indent?: number;
}) {
  return (
    <div
      className="flex items-center justify-between gap-3 py-1 text-[11px]"
      style={{ paddingLeft: indent * 12 }}
    >
      <span className="min-w-0 truncate text-foreground">{label}</span>
      <UsageCells usage={usage} />
    </div>
  );
}

function WorkspaceRows({
  workspace,
}: {
  workspace: ResourceWorkspaceMetrics;
}) {
  const t = useTranslations("resourceMonitor.popover");
  return (
    <Collapsible defaultOpen={false}>
      <CollapsibleTrigger className="group flex w-full items-center gap-1 py-1 text-left text-[11px] text-foreground hover:text-foreground">
        <ChevronRight className="size-3 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-90" />
        <span className="min-w-0 flex-1 truncate">{workspace.name}</span>
        <UsageCells usage={workspace.usage} />
      </CollapsibleTrigger>
      <CollapsibleContent>
        {workspace.sessions.length === 0 ? (
          <div className="py-1 pl-7 text-[11px] text-muted-foreground">
            {t("noSessions")}
          </div>
        ) : (
          workspace.sessions.map((session) => (
            <MetricRow
              key={session.session_id}
              indent={2}
              label={session.name?.trim() || t("unnamedSession")}
              usage={session.usage}
            />
          ))
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}

function ProjectRows({ project }: { project: ResourceProjectMetrics }) {
  const t = useTranslations("resourceMonitor.popover");
  return (
    <Collapsible defaultOpen>
      <CollapsibleTrigger className="group flex w-full items-center gap-1 py-1 text-left text-[11px] font-medium text-foreground hover:text-foreground">
        <ChevronRight className="size-3 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-90" />
        <span className="min-w-0 flex-1 truncate">{project.name}</span>
        <UsageCells usage={project.usage} />
      </CollapsibleTrigger>
      <CollapsibleContent>
        {project.sessions.length > 0 ? (
          <div className="pl-4">
            <div className="pt-1 text-[10px] text-muted-foreground">
              {t("projectSessions")}
            </div>
            {project.sessions.map((session) => (
              <MetricRow
                key={session.session_id}
                indent={1}
                label={session.name?.trim() || t("unnamedSession")}
                usage={session.usage}
              />
            ))}
          </div>
        ) : null}
        {project.workspaces.map((workspace) => (
          <div key={workspace.workspace_id} className="pl-4">
            <WorkspaceRows workspace={workspace} />
          </div>
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}

function StatusBanner({
  state,
}: {
  state: ResourceMonitorUiState;
}) {
  const t = useTranslations("resourceMonitor.popover");
  if (state === "ready") return null;
  const copy: Record<Exclude<ResourceMonitorUiState, "ready">, string> = {
    loading: t("loading"),
    disconnected: t("disconnected"),
    unsupported: t("unsupported"),
    stale: t("stale"),
    partial: t("partial"),
    empty: t("empty"),
  };
  return (
    <p className="rounded-md bg-muted/50 px-2 py-1.5 text-[11px] text-muted-foreground">
      {copy[state]}
    </p>
  );
}

export function ResourceMonitorPopover({
  connectionState,
  isLoading,
  lastUpdatedAtMs,
  snapshot,
  showDesktop,
  desktop,
  desktopLoading = false,
}: {
  connectionState: string;
  isLoading: boolean;
  lastUpdatedAtMs?: number;
  snapshot?: ResourceMonitorSnapshot;
  showDesktop: boolean;
  desktop?: DesktopShellMetricsSnapshot;
  desktopLoading?: boolean;
}) {
  const t = useTranslations("resourceMonitor.popover");
  const state = resolveResourceMonitorUiState({
    connectionState,
    isLoading,
    lastUpdatedAtMs,
    snapshot,
  });
  const showUnattributed =
    snapshot != null &&
    (isUsageVisible(snapshot.unattributed) ||
      snapshot.attribution_status === "partial");

  return (
    <div
      className="flex max-h-[min(420px,70vh)] flex-col gap-3 overflow-y-auto p-3"
      data-resource-monitor-state={state}
    >
      <div>
        <h3 className="text-xs font-medium text-foreground">{t("title")}</h3>
      </div>
      <StatusBanner state={state} />

      {snapshot ? (
        <>
          <section className="space-y-1">
            <h4 className="text-[10px] font-medium text-muted-foreground">{t("host")}</h4>
            <div className="flex items-center justify-between gap-3 text-[11px]">
              <span>{t("cpu")}</span>
              <span className="tabular-nums">{formatCpuPercent(snapshot.host.cpu_percent)}</span>
            </div>
            <div className="flex items-center justify-between gap-3 text-[11px]">
              <span>{t("memory")}</span>
              <span className="tabular-nums">
                {formatMemoryPair(
                  snapshot.host.memory_used_bytes,
                  snapshot.host.memory_total_bytes,
                )}
              </span>
            </div>
            <p className="text-[10px] text-muted-foreground">
              {t("logicalCpus", { count: snapshot.host.logical_cpu_count })}
            </p>
          </section>

          {showDesktop ? (
            <section className="space-y-1">
              <h4 className="text-[10px] font-medium text-muted-foreground">
                {t("desktop")}
              </h4>
              {desktopLoading ? (
                <p className="text-[11px] text-muted-foreground">{t("desktopLoading")}</p>
              ) : desktop?.supported ? (
                <>
                  <MetricRow label={t("desktopTotal")} usage={desktop.total} />
                  {desktop.groups
                    .filter((group) => isUsageVisible(group.usage))
                    .map((group) => (
                      <MetricRow
                        key={group.kind}
                        indent={1}
                        label={
                          group.kind === "main"
                            ? t("desktopGroup.main")
                            : group.kind === "renderer"
                              ? t("desktopGroup.renderer")
                              : group.kind === "gpu"
                                ? t("desktopGroup.gpu")
                                : group.kind === "utility"
                                  ? t("desktopGroup.utility")
                                  : t("desktopGroup.other")
                        }
                        usage={group.usage}
                      />
                    ))}
                </>
              ) : (
                <p className="text-[11px] text-muted-foreground">{t("desktopUnsupported")}</p>
              )}
            </section>
          ) : null}

          <section className="space-y-1">
            <h4 className="text-[10px] font-medium text-muted-foreground">
              {t("atmos")}
            </h4>
            <MetricRow label={t("server")} usage={snapshot.server} />
            <MetricRow label={t("sharedRuntime")} usage={snapshot.shared_runtime} />
          </section>

          <section className="space-y-1">
            <h4 className="text-[10px] font-medium text-muted-foreground">
              {t("projects")}
            </h4>
            {snapshot.projects.length === 0 ? (
              <p className="text-[11px] text-muted-foreground">{t("empty")}</p>
            ) : (
              snapshot.projects.map((project) => (
                <ProjectRows key={project.project_id} project={project} />
              ))
            )}
          </section>

          {showUnattributed ? (
            <section className="space-y-1">
              <h4 className="text-[10px] font-medium text-muted-foreground">
                {t("unattributed")}
              </h4>
              <MetricRow label={t("unattributed")} usage={snapshot.unattributed} />
            </section>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
