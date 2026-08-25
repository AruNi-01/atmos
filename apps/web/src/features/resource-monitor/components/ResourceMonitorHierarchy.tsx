"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { ChevronRight, Locate } from "lucide-react";
import {
  Badge,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@workspace/ui";
import { cn } from "@/shared/lib/utils";
import type {
  ResourceProcessMetrics,
  ResourceProjectMetrics,
  ResourceSessionMetrics,
  ResourceUsage,
  ResourceWorkspaceMetrics,
} from "@atmos/api-types/ws/dto/resource-monitor";
import type { DesktopShellMetricsSnapshot } from "@/features/resource-monitor/lib/desktop-shell-metrics";
import { ResourceMonitorSessionName } from "@/features/resource-monitor/components/ResourceMonitorSessionName";
import {
  RM_MEMORY,
  RM_METRIC,
  RM_NAME,
  RM_ROW,
  RM_ROW_INTERACTIVE,
  RM_ROW_PAD,
} from "@/features/resource-monitor/lib/resource-monitor-classes";
import {
  formatCpuPercent,
  formatListeningPort,
  formatMemoryBytes,
  formatProcessCountSuffix,
  isUsageVisible,
  normalizeProcessPorts,
  processBasename,
  sumAtmosUsage,
} from "@/features/resource-monitor/lib/resource-monitor-format";
import {
  atmosDefaultOpen,
  buildResourceMonitorScopeSections,
  projectResourcesDefaultOpen,
  shouldShowProjectResources,
  workspaceDefaultOpen,
} from "@/features/resource-monitor/lib/resource-monitor-hierarchy";
import { findResourceMonitorSessionLocation } from "@/features/resource-monitor/lib/resource-monitor-session-locator";
import type { ResourceMonitorSessionNavigationTarget } from "@/features/resource-monitor/lib/resource-monitor-session-navigation";
import {
  resolveResourceMonitorSessionDisplay,
  type ResourceMonitorSessionDisplay,
} from "@/features/resource-monitor/lib/resource-monitor-session-titles";
import {
  sortDesktopShellGroups,
  sortResourceMonitorProjects,
  type ResourceMonitorSortKey,
} from "@/features/resource-monitor/lib/resource-monitor-sort";
import type { LiveResourceSessionPanes } from "@/features/terminal/public";

const PROCESS_ROW =
  "flex min-h-8 w-full items-start gap-2 px-4 py-1 text-[12px] transition-none";

function NameLabel({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={cn("min-w-0 truncate", className)}>{name}</span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs">
        {name}
      </TooltipContent>
    </Tooltip>
  );
}

function MetricCells({ usage }: { usage: ResourceUsage }) {
  const t = useTranslations("resourceMonitor.popover");
  const cpu = formatCpuPercent(usage.cpu_percent);
  const memory = formatMemoryBytes(usage.memory_rss_bytes);
  return (
    <>
      <span
        className={RM_METRIC}
        aria-label={t("usageAriaLabel", { cpu, memory })}
        data-resource-monitor-metric="cpu"
      >
        {cpu}
      </span>
      <span className={RM_MEMORY} data-resource-monitor-metric="memory">
        {memory}
      </span>
    </>
  );
}

function SortHeaderButton({
  column,
  active,
  direction,
  className,
  children,
  onClick,
}: {
  column: string;
  active: boolean;
  direction: "ascending" | "descending";
  className?: string;
  children: React.ReactNode;
  onClick: () => void;
}) {
  const t = useTranslations("resourceMonitor.popover");
  const directionLabel =
    direction === "ascending" ? t("sortAscending") : t("sortDescending");
  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={
        active
          ? t("sortPressed", { column, direction: directionLabel })
          : t("sortColumn", { column })
      }
      className={cn(
        "inline-flex h-7 items-center gap-0.5 rounded-md px-2 text-[10px] font-medium transition-none hover:bg-accent hover:text-foreground",
        active ? "text-foreground" : "text-muted-foreground",
        className,
      )}
      onClick={onClick}
    >
      <span data-resource-monitor-column-label={column}>{children}</span>
    </button>
  );
}

function ProcessRow({
  process,
  indent,
  residual = false,
}: {
  process: ResourceProcessMetrics;
  indent: number;
  residual?: boolean;
}) {
  const t = useTranslations("resourceMonitor.popover");
  const name = residual ? t("ungroupedProcesses") : processBasename(process.name);
  const countSuffix = formatProcessCountSuffix(process.usage.process_count);
  const ports = normalizeProcessPorts(process.ports);
  return (
    <div
      className={cn(PROCESS_ROW, "cursor-default text-muted-foreground")}
      data-resource-monitor-process={residual ? "residual" : ""}
      data-process-name={name}
    >
      <span
        className={cn(RM_NAME, "flex min-w-0 items-start")}
        style={{ paddingLeft: indent * 12 }}
      >
        <span className="flex min-w-0 max-h-9 flex-wrap content-start items-center gap-x-1 gap-y-0.5 overflow-hidden">
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="truncate text-muted-foreground">{name}</span>
            </TooltipTrigger>
            <TooltipContent side="top">{t("includedInTotal")}</TooltipContent>
          </Tooltip>
          {countSuffix ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="shrink-0 text-muted-foreground">{countSuffix}</span>
              </TooltipTrigger>
              <TooltipContent side="top">
                {t("processCount", { count: process.usage.process_count })}
              </TooltipContent>
            </Tooltip>
          ) : null}
          {ports.map((port) => (
            <Tooltip key={port}>
              <TooltipTrigger asChild>
                <span
                  data-resource-monitor-port={String(port)}
                  className="inline-flex h-4 shrink-0 items-center rounded-sm bg-muted px-1 font-mono text-[10px] text-muted-foreground"
                >
                  {formatListeningPort(port)}
                </span>
              </TooltipTrigger>
              <TooltipContent side="top">
                {t("listeningPort", { port })}
              </TooltipContent>
            </Tooltip>
          ))}
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                data-resource-monitor-included=""
                className="shrink-0 text-[10px] leading-4 text-muted-foreground/80"
              >
                ⊂ {t("includedCaption")}
              </span>
            </TooltipTrigger>
            <TooltipContent side="top">{t("includedInTotal")}</TooltipContent>
          </Tooltip>
        </span>
      </span>
      <MetricCells usage={process.usage} />
    </div>
  );
}

function SessionRow({
  session,
  hostId,
  routeKind,
  liveDisplays,
  workspacePanes,
  indent,
  onNavigate,
}: {
  session: ResourceSessionMetrics;
  hostId: string;
  routeKind: ResourceMonitorSessionNavigationTarget["routeKind"];
  liveDisplays: ReadonlyMap<string, ResourceMonitorSessionDisplay>;
  workspacePanes: LiveResourceSessionPanes | null;
  indent: number;
  onNavigate?: (target: ResourceMonitorSessionNavigationTarget) => void;
}) {
  const t = useTranslations("resourceMonitor.popover");
  const display = resolveResourceMonitorSessionDisplay(
    session.session_id,
    session.name,
    liveDisplays,
    t("unnamedSession"),
  );
  const name = display.displayTitle;
  const location = findResourceMonitorSessionLocation(
    workspacePanes,
    hostId,
    session.session_id,
  );
  const locatable = location != null && onNavigate != null;
  const cpu = formatCpuPercent(session.usage.cpu_percent);
  const memory = formatMemoryBytes(session.usage.memory_rss_bytes);
  const hasProcesses = session.processes.length > 0;
  const locateAria = t("sessionRowAria", {
    action: t("locateSession"),
    name,
    cpu,
    memory,
  });

  const nameCluster = (leading: React.ReactNode) => (
    <span
      className={cn(RM_NAME, "flex items-center gap-1")}
      style={{ paddingLeft: indent * 12 }}
    >
      {leading}
      <Tooltip>
        <TooltipTrigger asChild>
          <ResourceMonitorSessionName
            name={name}
            toolbarAgent={display.toolbarAgent}
          />
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          {name}
        </TooltipContent>
      </Tooltip>
    </span>
  );

  if (!hasProcesses) {
    const body = (
      <>
        {nameCluster(
          locatable ? (
            <Locate className="size-3 shrink-0 text-muted-foreground" aria-hidden />
          ) : (
            <span className="size-3 shrink-0" aria-hidden />
          ),
        )}
        <MetricCells usage={session.usage} />
      </>
    );
    if (locatable) {
      return (
        <button
          type="button"
          data-resource-monitor-session=""
          data-session-id={session.session_id}
          aria-label={locateAria}
          className={cn(RM_ROW, RM_ROW_INTERACTIVE, "justify-start text-left")}
          onClick={() => onNavigate({ location, routeKind })}
        >
          {body}
        </button>
      );
    }
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={cn(RM_ROW, RM_ROW_PAD)}
            data-resource-monitor-session=""
            data-session-id={session.session_id}
          >
            {body}
          </div>
        </TooltipTrigger>
        <TooltipContent side="top">{t("sessionUnavailable")}</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Collapsible
      defaultOpen={false}
      data-resource-monitor-session=""
      data-session-id={session.session_id}
    >
      <div className={cn(RM_ROW, RM_ROW_PAD, "gap-1")}>
        <span
          className="flex min-h-6 min-w-0 flex-1 items-center gap-1"
          style={{ paddingLeft: indent * 12 }}
        >
          <CollapsibleTrigger
            type="button"
            data-resource-monitor-session-trigger=""
            aria-label={t("sessionProcessesAria", { name })}
            className="group inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent"
          >
            <ChevronRight className="size-3 transition-transform group-data-[state=open]:rotate-90" />
          </CollapsibleTrigger>
          {locatable ? (
            <button
              type="button"
              data-resource-monitor-session-locate=""
              aria-label={locateAria}
              className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md px-0 text-left hover:bg-accent"
              onClick={() => onNavigate({ location, routeKind })}
            >
              <span className={cn(RM_NAME, "flex items-center gap-1")}>
                <Locate className="size-3 shrink-0 text-muted-foreground" aria-hidden />
                <ResourceMonitorSessionName
                  name={name}
                  toolbarAgent={display.toolbarAgent}
                />
              </span>
              <MetricCells usage={session.usage} />
            </button>
          ) : (
            <div className="flex h-8 min-w-0 flex-1 items-center gap-2">
              <span className={cn(RM_NAME, "flex items-center gap-1")}>
                <span className="size-3 shrink-0" aria-hidden />
                <ResourceMonitorSessionName
                  name={name}
                  toolbarAgent={display.toolbarAgent}
                />
              </span>
              <MetricCells usage={session.usage} />
            </div>
          )}
        </span>
      </div>
      <CollapsibleContent>
        {session.processes.map((process) => (
          <ProcessRow
            key={`${session.session_id}:${process.name}`}
            process={process}
            indent={indent + 1}
          />
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}

function GroupRow({
  name,
  usage,
  indent = 0,
  defaultOpen = false,
  dataAttr,
  trailingBadge,
  children,
}: {
  name: string;
  usage: ResourceUsage;
  indent?: number;
  defaultOpen?: boolean;
  dataAttr?: Record<string, string>;
  trailingBadge?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Collapsible defaultOpen={defaultOpen}>
      <CollapsibleTrigger
        className={cn(RM_ROW, RM_ROW_INTERACTIVE, "group text-left")}
        {...dataAttr}
      >
        <span
          className={cn(RM_NAME, "flex items-center gap-1")}
          style={{ paddingLeft: indent * 12 }}
        >
          <ChevronRight className="size-3 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-90" />
          <NameLabel name={name} className="font-medium text-foreground" />
          {trailingBadge}
        </span>
        <MetricCells usage={usage} />
      </CollapsibleTrigger>
      <CollapsibleContent>{children}</CollapsibleContent>
    </Collapsible>
  );
}

function StaticRow({
  name,
  usage,
  indent = 0,
}: {
  name: string;
  usage: ResourceUsage;
  indent?: number;
}) {
  return (
    <div className={cn(RM_ROW, RM_ROW_PAD)}>
      <span className={RM_NAME} style={{ paddingLeft: indent * 12 }}>
        <NameLabel name={name} className="text-foreground" />
      </span>
      <MetricCells usage={usage} />
    </div>
  );
}

function ScopeSections({
  sessions,
  otherUsage,
  otherProcesses,
  sessionHostId,
  routeKind,
  liveDisplays,
  workspacePanes,
  indent,
  onNavigate,
}: {
  sessions: ResourceSessionMetrics[];
  otherUsage: ResourceUsage;
  otherProcesses: ResourceProcessMetrics[];
  sessionHostId: string;
  routeKind: ResourceMonitorSessionNavigationTarget["routeKind"];
  liveDisplays: ReadonlyMap<string, ResourceMonitorSessionDisplay>;
  workspacePanes: LiveResourceSessionPanes | null;
  indent: number;
  onNavigate?: (target: ResourceMonitorSessionNavigationTarget) => void;
}) {
  const t = useTranslations("resourceMonitor.popover");
  const sections = buildResourceMonitorScopeSections(
    sessions,
    otherUsage,
    otherProcesses,
  );
  return (
    <>
      {sections.map((section) => {
        if (section.kind === "empty") {
          return (
            <div
              key="empty"
              className="px-3 py-1 text-[11px] text-muted-foreground"
              style={{ paddingLeft: 12 + indent * 12 }}
            >
              {t("noAttributedResources")}
            </div>
          );
        }
        if (section.kind === "sessions") {
          return (
            <div key="sessions">
              <SectionLabel indent={indent}>{t("sessions")}</SectionLabel>
              {section.sessions.map((session) => (
                <SessionRow
                  key={session.session_id}
                  session={session}
                  hostId={sessionHostId}
                  routeKind={routeKind}
                  liveDisplays={liveDisplays}
                  workspacePanes={workspacePanes}
                  indent={indent}
                  onNavigate={onNavigate}
                />
              ))}
            </div>
          );
        }
        return (
          <div key="other-processes">
            <SectionLabel indent={indent}>{t("otherProcesses")}</SectionLabel>
            {section.processes.map((process) => (
              <ProcessRow
                key={`other:${process.name}`}
                process={process}
                indent={indent}
              />
            ))}
            {section.residual ? (
              <ProcessRow
                process={{
                  name: "ungrouped-processes",
                  usage: section.residualUsage,
                  ports: [],
                }}
                indent={indent}
                residual
              />
            ) : null}
          </div>
        );
      })}
    </>
  );
}

function WorkspaceBlock({
  workspace,
  liveDisplays,
  workspacePanes,
  onNavigate,
}: {
  workspace: ResourceWorkspaceMetrics;
  liveDisplays: ReadonlyMap<string, ResourceMonitorSessionDisplay>;
  workspacePanes: LiveResourceSessionPanes | null;
  onNavigate?: (target: ResourceMonitorSessionNavigationTarget) => void;
}) {
  const t = useTranslations("resourceMonitor.popover");
  return (
    <GroupRow
      name={workspace.name}
      usage={workspace.usage}
      indent={1}
      defaultOpen={workspaceDefaultOpen()}
      dataAttr={{ "data-resource-monitor-workspace": workspace.workspace_id }}
      trailingBadge={
        <Badge
          variant="secondary"
          className="h-4 shrink-0 rounded px-1 text-[9px] font-medium"
          data-resource-monitor-workspace-badge=""
        >
          {t("workspaceBadge")}
        </Badge>
      }
    >
      <ScopeSections
        sessions={workspace.sessions}
        otherUsage={workspace.other_usage}
        otherProcesses={workspace.other_processes}
        sessionHostId={workspace.workspace_id}
        routeKind="workspace"
        liveDisplays={liveDisplays}
        workspacePanes={workspacePanes}
        indent={2}
        onNavigate={onNavigate}
      />
    </GroupRow>
  );
}

function ProjectBlock({
  project,
  liveDisplays,
  workspacePanes,
  defaultOpen,
  onNavigate,
}: {
  project: ResourceProjectMetrics;
  liveDisplays: ReadonlyMap<string, ResourceMonitorSessionDisplay>;
  workspacePanes: LiveResourceSessionPanes | null;
  defaultOpen: boolean;
  onNavigate?: (target: ResourceMonitorSessionNavigationTarget) => void;
}) {
  const t = useTranslations("resourceMonitor.popover");
  return (
    <GroupRow
      name={project.name}
      usage={project.usage}
      defaultOpen={defaultOpen}
      dataAttr={{ "data-resource-monitor-project": project.project_id }}
    >
      {shouldShowProjectResources(project) ? (
        <GroupRow
          name={t("projectResources")}
          usage={project.direct_usage}
          indent={1}
          defaultOpen={projectResourcesDefaultOpen(project)}
          dataAttr={{ "data-resource-monitor-project-resources": "" }}
        >
          <ScopeSections
            sessions={project.sessions}
            otherUsage={project.other_usage}
            otherProcesses={project.other_processes}
            sessionHostId={project.project_id}
            routeKind="project"
            liveDisplays={liveDisplays}
            workspacePanes={workspacePanes}
            indent={2}
            onNavigate={onNavigate}
          />
        </GroupRow>
      ) : null}
      {project.workspaces.map((workspace) => (
        <WorkspaceBlock
          key={workspace.workspace_id}
          workspace={workspace}
          liveDisplays={liveDisplays}
          workspacePanes={workspacePanes}
          onNavigate={onNavigate}
        />
      ))}
    </GroupRow>
  );
}

function AtmosBlock({
  snapshotServer,
  snapshotShared,
  showDesktop,
  desktop,
  desktopLoading,
}: {
  snapshotServer: ResourceUsage;
  snapshotShared: ResourceUsage;
  showDesktop: boolean;
  desktop?: DesktopShellMetricsSnapshot;
  desktopLoading: boolean;
}) {
  const t = useTranslations("resourceMonitor.popover");
  const [open, setOpen] = React.useState(atmosDefaultOpen);
  const atmosUsage = sumAtmosUsage(snapshotServer, snapshotShared);
  const desktopGroups = desktop?.supported
    ? desktop.groups.filter((group) => isUsageVisible(group.usage))
    : [];

  const desktopLabel = (kind: (typeof desktopGroups)[number]["kind"]) => {
    if (kind === "main") return t("desktopGroup.main");
    if (kind === "renderer") return t("desktopGroup.renderer");
    if (kind === "gpu") return t("desktopGroup.gpu");
    if (kind === "utility") return t("desktopGroup.utility");
    return t("desktopGroup.other");
  };

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="min-w-0 w-full"
      data-resource-monitor-atmos=""
    >
      <CollapsibleTrigger
        type="button"
        data-resource-monitor-atmos-trigger=""
        aria-label={open ? t("collapseAtmos") : t("expandAtmos")}
        className={cn(RM_ROW, RM_ROW_INTERACTIVE, "group min-w-0 text-left")}
      >
        <span className={cn(RM_NAME, "flex items-center gap-1")}>
          <ChevronRight className="size-3 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-90" />
          <NameLabel name={t("atmos")} className="font-medium text-foreground" />
        </span>
        <MetricCells usage={atmosUsage} />
      </CollapsibleTrigger>
      <CollapsibleContent>
        {showDesktop ? (
          <>
            <SectionLabel>{t("desktop")}</SectionLabel>
            {desktopLoading ? (
              <div className="px-3 py-1 text-[11px] text-muted-foreground">
                {t("desktopLoading")}
              </div>
            ) : desktop?.supported ? (
              <>
                <StaticRow name={t("desktopTotal")} usage={desktop.total} />
                {desktopGroups.map((group) => (
                  <StaticRow
                    key={group.kind}
                    name={desktopLabel(group.kind)}
                    usage={group.usage}
                    indent={1}
                  />
                ))}
              </>
            ) : (
              <div className="px-3 py-1 text-[11px] text-muted-foreground">
                {t("desktopUnsupported")}
              </div>
            )}
          </>
        ) : null}
        <StaticRow name={t("server")} usage={snapshotServer} />
        <StaticRow name={t("sharedRuntime")} usage={snapshotShared} />
      </CollapsibleContent>
    </Collapsible>
  );
}

function SectionLabel({
  children,
  indent = 0,
}: {
  children: React.ReactNode;
  indent?: number;
}) {
  return (
    <div
      className="px-3 pt-2 pb-0.5 text-[10px] font-medium text-muted-foreground"
      style={indent > 0 ? { paddingLeft: 12 + indent * 12 } : undefined}
    >
      {children}
    </div>
  );
}

export function ResourceMonitorHierarchy({
  sortKey,
  onSortKeyChange,
  snapshotProjects,
  snapshotServer,
  snapshotShared,
  snapshotUnattributed,
  showUnattributed,
  showProjectsEmpty,
  showDesktop,
  desktop,
  desktopLoading,
  liveDisplays,
  workspacePanes,
  onNavigate,
}: {
  sortKey: ResourceMonitorSortKey;
  onSortKeyChange: (key: ResourceMonitorSortKey) => void;
  snapshotProjects: ResourceProjectMetrics[];
  snapshotServer: ResourceUsage;
  snapshotShared: ResourceUsage;
  snapshotUnattributed: ResourceUsage;
  showUnattributed: boolean;
  showProjectsEmpty: boolean;
  showDesktop: boolean;
  desktop?: DesktopShellMetricsSnapshot;
  desktopLoading: boolean;
  liveDisplays: ReadonlyMap<string, ResourceMonitorSessionDisplay>;
  workspacePanes: LiveResourceSessionPanes | null;
  onNavigate?: (target: ResourceMonitorSessionNavigationTarget) => void;
}) {
  const t = useTranslations("resourceMonitor.popover");
  const resolveSessionName = React.useCallback(
    (session: ResourceSessionMetrics) =>
      resolveResourceMonitorSessionDisplay(
        session.session_id,
        session.name,
        liveDisplays,
        t("unnamedSession"),
      ).displayTitle,
    [liveDisplays, t],
  );
  const projects = sortResourceMonitorProjects(
    snapshotProjects,
    sortKey,
    resolveSessionName,
  );
  const desktopForSort = desktop?.supported
    ? {
        ...desktop,
        groups: sortDesktopShellGroups(
          desktop.groups.filter((group) => isUsageVisible(group.usage)),
          sortKey,
        ),
      }
    : desktop;

  return (
    <div className="min-w-0" data-resource-monitor-table="">
      <div
        className={cn(RM_ROW, "w-full sticky top-0 z-10 bg-popover px-2")}
        data-resource-monitor-sort=""
        aria-label={t("sortBy")}
      >
        <SortHeaderButton
          column={t("name")}
          active={sortKey === "name"}
          direction="ascending"
          className={cn(RM_NAME, "justify-start")}
          onClick={() => onSortKeyChange("name")}
        >
          {t("name")}
        </SortHeaderButton>
        <SortHeaderButton
          column={t("cpu")}
          active={sortKey === "cpu"}
          direction="descending"
          className={cn(RM_METRIC, "justify-end")}
          onClick={() => onSortKeyChange("cpu")}
        >
          {t("cpu")}
        </SortHeaderButton>
        <SortHeaderButton
          column={t("memory")}
          active={sortKey === "memory"}
          direction="descending"
          className={cn(RM_MEMORY, "justify-end")}
          onClick={() => onSortKeyChange("memory")}
        >
          {t("memory")}
        </SortHeaderButton>
      </div>

      <AtmosBlock
        snapshotServer={snapshotServer}
        snapshotShared={snapshotShared}
        showDesktop={showDesktop}
        desktop={desktopForSort}
        desktopLoading={desktopLoading}
      />

      <SectionLabel>{t("projects")}</SectionLabel>
      {projects.length === 0 ? (
        showProjectsEmpty ? (
          <div className="px-3 py-1 text-[11px] text-muted-foreground">{t("empty")}</div>
        ) : null
      ) : (
        projects.map((project, index) => (
          <ProjectBlock
            key={project.project_id}
            project={project}
            liveDisplays={liveDisplays}
            workspacePanes={workspacePanes}
            defaultOpen={index === 0}
            onNavigate={onNavigate}
          />
        ))
      )}

      {showUnattributed ? (
        <>
          <SectionLabel>{t("other")}</SectionLabel>
          <StaticRow name={t("unattributed")} usage={snapshotUnattributed} />
        </>
      ) : null}
    </div>
  );
}
