"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { ChevronRight, Locate } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@workspace/ui";
import { cn } from "@/shared/lib/utils";
import type {
  ResourceProjectMetrics,
  ResourceSessionMetrics,
  ResourceUsage,
  ResourceWorkspaceMetrics,
} from "@atmos/api-types/ws/dto/resource-monitor";
import type { DesktopShellMetricsSnapshot } from "@/features/resource-monitor/lib/desktop-shell-metrics";
import {
  formatCpuPercent,
  formatMemoryBytes,
  isUsageVisible,
} from "@/features/resource-monitor/lib/resource-monitor-format";
import { findResourceMonitorSessionLocation } from "@/features/resource-monitor/lib/resource-monitor-session-locator";
import type { ResourceMonitorSessionNavigationTarget } from "@/features/resource-monitor/lib/resource-monitor-session-navigation";
import { resolveResourceMonitorSessionTitle } from "@/features/resource-monitor/lib/resource-monitor-session-titles";
import {
  sortDesktopShellGroups,
  sortResourceMonitorProjects,
  type ResourceMonitorSortKey,
} from "@/features/resource-monitor/lib/resource-monitor-sort";
import type { LiveResourceSessionPanes } from "@/features/terminal/public";

const ROW =
  "flex h-8 w-full items-center gap-2 px-3 text-[12px] transition-none";
const NAME = "min-w-0 flex-1";
const METRIC = "w-[3.25rem] shrink-0 text-right tabular-nums text-muted-foreground";
const MEMORY = "w-[4.25rem] shrink-0 text-right tabular-nums text-muted-foreground";

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
      <span className={METRIC} aria-label={t("usageAriaLabel", { cpu, memory })}>
        {cpu}
      </span>
      <span className={MEMORY}>{memory}</span>
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
        "inline-flex h-8 items-center gap-0.5 text-[10px] font-medium transition-none hover:text-foreground",
        active ? "text-foreground" : "text-muted-foreground",
        className,
      )}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function SessionRow({
  session,
  hostId,
  routeKind,
  liveTitles,
  workspacePanes,
  indent,
  onNavigate,
}: {
  session: ResourceSessionMetrics;
  hostId: string;
  routeKind: ResourceMonitorSessionNavigationTarget["routeKind"];
  liveTitles: ReadonlyMap<string, string>;
  workspacePanes: LiveResourceSessionPanes | null;
  indent: number;
  onNavigate?: (target: ResourceMonitorSessionNavigationTarget) => void;
}) {
  const t = useTranslations("resourceMonitor.popover");
  const name = resolveResourceMonitorSessionTitle(
    session.session_id,
    session.name,
    liveTitles,
    t("unnamedSession"),
  );
  const location = findResourceMonitorSessionLocation(
    workspacePanes,
    hostId,
    session.session_id,
  );
  const locatable = location != null && onNavigate != null;
  const cpu = formatCpuPercent(session.usage.cpu_percent);
  const memory = formatMemoryBytes(session.usage.memory_rss_bytes);

  const body = (
    <>
      <span
        className={cn(NAME, "flex items-center gap-1")}
        style={{ paddingLeft: indent * 12 }}
      >
        {locatable ? (
          <Locate className="size-3 shrink-0 text-muted-foreground" aria-hidden />
        ) : (
          <span className="size-3 shrink-0" aria-hidden />
        )}
        <NameLabel name={name} />
      </span>
      <MetricCells usage={session.usage} />
    </>
  );

  if (locatable) {
    return (
      <button
        type="button"
        aria-label={t("sessionRowAria", {
          action: t("locateSession"),
          name,
          cpu,
          memory,
        })}
        className={cn(ROW, "justify-start text-left hover:bg-accent")}
        onClick={() => onNavigate({ location, routeKind })}
      >
        {body}
      </button>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className={ROW}>{body}</div>
      </TooltipTrigger>
      <TooltipContent side="top">{t("sessionUnavailable")}</TooltipContent>
    </Tooltip>
  );
}

function GroupRow({
  name,
  usage,
  indent = 0,
  defaultOpen = false,
  children,
}: {
  name: string;
  usage: ResourceUsage;
  indent?: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Collapsible defaultOpen={defaultOpen}>
      <CollapsibleTrigger
        className={cn(ROW, "group w-full text-left hover:bg-accent")}
      >
        <span
          className={cn(NAME, "flex items-center gap-1")}
          style={{ paddingLeft: indent * 12 }}
        >
          <ChevronRight className="size-3 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-90" />
          <NameLabel name={name} className="font-medium text-foreground" />
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
    <div className={ROW}>
      <span className={NAME} style={{ paddingLeft: indent * 12 }}>
        <NameLabel name={name} className="text-foreground" />
      </span>
      <MetricCells usage={usage} />
    </div>
  );
}

function WorkspaceBlock({
  workspace,
  liveTitles,
  workspacePanes,
  onNavigate,
}: {
  workspace: ResourceWorkspaceMetrics;
  liveTitles: ReadonlyMap<string, string>;
  workspacePanes: LiveResourceSessionPanes | null;
  onNavigate?: (target: ResourceMonitorSessionNavigationTarget) => void;
}) {
  const t = useTranslations("resourceMonitor.popover");
  return (
    <GroupRow name={workspace.name} usage={workspace.usage} indent={1}>
      {workspace.sessions.length === 0 ? (
        <div className="px-3 py-1 pl-10 text-[11px] text-muted-foreground">
          {t("noSessions")}
        </div>
      ) : (
        workspace.sessions.map((session) => (
          <SessionRow
            key={session.session_id}
            session={session}
            hostId={workspace.workspace_id}
            routeKind="workspace"
            liveTitles={liveTitles}
            workspacePanes={workspacePanes}
            indent={2}
            onNavigate={onNavigate}
          />
        ))
      )}
    </GroupRow>
  );
}

function ProjectBlock({
  project,
  liveTitles,
  workspacePanes,
  defaultOpen,
  onNavigate,
}: {
  project: ResourceProjectMetrics;
  liveTitles: ReadonlyMap<string, string>;
  workspacePanes: LiveResourceSessionPanes | null;
  defaultOpen: boolean;
  onNavigate?: (target: ResourceMonitorSessionNavigationTarget) => void;
}) {
  return (
    <GroupRow
      name={project.name}
      usage={project.usage}
      defaultOpen={defaultOpen}
    >
      {project.sessions.map((session) => (
        <SessionRow
          key={session.session_id}
          session={session}
          hostId={project.project_id}
          routeKind="project"
          liveTitles={liveTitles}
          workspacePanes={workspacePanes}
          indent={1}
          onNavigate={onNavigate}
        />
      ))}
      {project.workspaces.map((workspace) => (
        <WorkspaceBlock
          key={workspace.workspace_id}
          workspace={workspace}
          liveTitles={liveTitles}
          workspacePanes={workspacePanes}
          onNavigate={onNavigate}
        />
      ))}
    </GroupRow>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-3 pt-2 pb-0.5 text-[10px] font-medium text-muted-foreground">
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
  liveTitles,
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
  liveTitles: ReadonlyMap<string, string>;
  workspacePanes: LiveResourceSessionPanes | null;
  onNavigate?: (target: ResourceMonitorSessionNavigationTarget) => void;
}) {
  const t = useTranslations("resourceMonitor.popover");
  const resolveSessionName = React.useCallback(
    (session: ResourceSessionMetrics) =>
      resolveResourceMonitorSessionTitle(
        session.session_id,
        session.name,
        liveTitles,
        t("unnamedSession"),
      ),
    [liveTitles, t],
  );
  const projects = sortResourceMonitorProjects(
    snapshotProjects,
    sortKey,
    resolveSessionName,
  );
  const desktopGroups = desktop?.supported
    ? sortDesktopShellGroups(
        desktop.groups.filter((group) => isUsageVisible(group.usage)),
        sortKey,
      )
    : [];

  const desktopLabel = (kind: (typeof desktopGroups)[number]["kind"]) => {
    if (kind === "main") return t("desktopGroup.main");
    if (kind === "renderer") return t("desktopGroup.renderer");
    if (kind === "gpu") return t("desktopGroup.gpu");
    if (kind === "utility") return t("desktopGroup.utility");
    return t("desktopGroup.other");
  };

  return (
    <div data-resource-monitor-table="">
      <div
        className={cn(
          ROW,
          "sticky top-0 z-10 border-b border-border bg-popover",
        )}
        data-resource-monitor-sort=""
        aria-label={t("sortBy")}
      >
        <SortHeaderButton
          column={t("name")}
          active={sortKey === "name"}
          direction="ascending"
          className={cn(NAME, "justify-start")}
          onClick={() => onSortKeyChange("name")}
        >
          {t("name")}
        </SortHeaderButton>
        <SortHeaderButton
          column={t("cpu")}
          active={sortKey === "cpu"}
          direction="descending"
          className={cn(METRIC, "justify-end")}
          onClick={() => onSortKeyChange("cpu")}
        >
          {t("cpu")}
        </SortHeaderButton>
        <SortHeaderButton
          column={t("memory")}
          active={sortKey === "memory"}
          direction="descending"
          className={cn(MEMORY, "justify-end")}
          onClick={() => onSortKeyChange("memory")}
        >
          {t("memory")}
        </SortHeaderButton>
      </div>

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

      <SectionLabel>{t("atmos")}</SectionLabel>
      <StaticRow name={t("server")} usage={snapshotServer} />
      <StaticRow name={t("sharedRuntime")} usage={snapshotShared} />

      <SectionLabel>{t("projects")}</SectionLabel>
      {projects.length === 0 ? (
        showProjectsEmpty ? (
          <div className="px-3 py-1 text-[11px] text-muted-foreground">{t("empty")}</div>
        ) : null
      ) : (
        projects.map((project, index) => (
          <ProjectBlock
            key={`${sortKey}:${project.project_id}`}
            project={project}
            liveTitles={liveTitles}
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
