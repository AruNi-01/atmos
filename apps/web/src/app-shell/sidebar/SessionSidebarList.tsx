"use client";

import { useMemo } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useQueries } from "@tanstack/react-query";
import { ScrollArea, cn } from "@workspace/ui";
import { ChevronRight } from "lucide-react";
import { formatRelativeTime } from "@atmos/shared";
import { useComputerQueryScope } from "@/api/query/query-scope";
import { WorkspaceGroupMarker } from "@/app-shell/left-sidebar-controls";
import {
  LEFT_SIDEBAR_DIVIDER_GUTTER_PR_CLASS,
  LEFT_SIDEBAR_STICKY_GROUP_HEADER_CLASS,
} from "@/app-shell/sidebar-layout-constants";
import {
  useWorkspaceListVisibleCount,
  WorkspaceListShowMoreLess,
} from "@/app-shell/sidebar/workspace-list-pagination";
import { getWorkspaceAgentGroupMeta } from "@/app-shell/sidebar/workspace-status";
import type { SidebarGroupingMode } from "@/app-shell/sidebar/workspace-status";
import {
  formatSessionRowSubtitle,
  type SidebarSessionGroup,
  type SidebarSessionRow,
} from "@/app-shell/sidebar/session-grouping";
import {
  resolveSessionPrLifecycle,
  sessionBranchPrTargets,
} from "@/app-shell/sidebar/session-pr";
import {
  AGENT_TOOL,
  useAgentStatusStore,
  type AgentStatusRecord,
  type AgentToolType,
} from "@/features/agent/store/agent-status-store";
import {
  canNavigateToAgentStatusSession,
  navigateToAgentStatusSession,
} from "@/features/agent/lib/agent-status-navigation";
import { useWebSocketStore } from "@/features/connection/hooks/use-websocket";
import { parseStandaloneScope, standaloneJobHref } from "@/features/automations/lib/automation-run-landing";
import { branchPrListQueryOptions } from "@/features/github/lib/github-query-options";
import type { BranchPr } from "@/features/github/lib/github-pr-cache";
import type { WorkspacePrLifecycleState } from "@/features/github/lib/workspace-pr-status";
import type { NavigateToLocatedPaneRouter } from "@/features/terminal/public/navigate-to-located-pane";
import { useAppRouter } from "@/shared/hooks/use-app-router";
import type { Project } from "@/shared/types/domain";

function asAgentTool(value: string | null | undefined): AgentToolType {
  if (value && (Object.values(AGENT_TOOL) as string[]).includes(value)) {
    return value as AgentToolType;
  }
  return AGENT_TOOL.AGENT;
}

function liveSession(sessionId: string): AgentStatusRecord | undefined {
  const sessions = useAgentStatusStore.getState().sessions;
  const direct = sessions.get(sessionId);
  if (direct) return direct;
  for (const record of sessions.values()) {
    if (record.pane_id === sessionId || record.surface_id === sessionId) return record;
  }
  return undefined;
}

function toStatusRecord(
  row: SidebarSessionRow,
  live: AgentStatusRecord | undefined,
): AgentStatusRecord {
  const chatId = row.surface === "chat"
    ? row.surfaceId?.trim() ||
      (row.sessionId.startsWith("chat:") ? row.sessionId.slice("chat:".length) : null)
    : null;
  const paneId = row.surface === "terminal"
    ? live?.pane_id ??
      row.surfaceId ??
      (row.sessionId.includes(":") ? row.sessionId : null)
    : live?.pane_id ?? null;
  return {
    session_id: row.sessionId,
    tool: live?.tool ?? asAgentTool(row.tool),
    state: live?.state ?? "idle",
    timestamp: row.updatedAt,
    project_path: live?.project_path ?? row.projectPath,
    context_id: row.contextId,
    pane_id: paneId,
    surface: row.surface,
    surface_id: row.surface === "chat" ? chatId : row.surfaceId ?? live?.surface_id ?? null,
    space_id: live?.space_id ?? null,
    provider_id: live?.provider_id ?? row.tool,
    side_chat_id: live?.side_chat_id ?? null,
    source_pane_id: live?.source_pane_id ?? null,
    terminal_kind: live?.terminal_kind ?? null,
  };
}

function openSessionContext(
  row: SidebarSessionRow,
  router: { push: (path: string) => void },
) {
  if (row.workspace) {
    const jobGuid = parseStandaloneScope(row.workspace.id);
    router.push(jobGuid ? standaloneJobHref(jobGuid) : `/workspace?id=${row.workspace.id}`);
    return;
  }
  if (row.projectId) router.push(`/project?id=${row.projectId}`);
}

function activateSidebarSessionRow(
  row: SidebarSessionRow,
  router: NavigateToLocatedPaneRouter,
  projects: Project[],
) {
  const record = toStatusRecord(row, liveSession(row.sessionId));
  if (row.contextId && canNavigateToAgentStatusSession(record)) {
    navigateToAgentStatusSession(record, router, projects);
    return;
  }
  openSessionContext(row, router);
}

function prStateLabel(
  state: WorkspacePrLifecycleState,
  labels: {
    open: string;
    draft: string;
    merged: string;
    closed: string;
  },
): string {
  return labels[state];
}

function useSessionBranchPrMap(rows: readonly SidebarSessionRow[]) {
  const targets = useMemo(() => sessionBranchPrTargets(rows), [rows]);
  const scope = useComputerQueryScope();
  const connectionState = useWebSocketStore((state) => state.connectionState);
  const results = useQueries({
    queries: targets.map((target) =>
      branchPrListQueryOptions(
        scope,
        connectionState,
        {
          owner: target.owner,
          repo: target.repo,
          branch: target.branch,
          state: "all",
        },
        { enabled: true },
      ),
    ),
  });

  return useMemo(() => {
    const map = new Map<string, BranchPr[]>();
    targets.forEach((target, index) => {
      const data = results[index]?.data;
      if (Array.isArray(data)) map.set(target.key, data);
    });
    return map;
  }, [results, targets]);
}

function SessionSidebarRow({
  onArchive,
  row,
  branchPrs,
  projects,
}: {
  onArchive: (sessionId: string) => void;
  row: SidebarSessionRow;
  branchPrs: BranchPr[] | undefined;
  projects: Project[];
}) {
  const locale = useLocale();
  const viewT = useTranslations("appShell.task");
  const chromeT = useTranslations("AppShell.chrome");
  const router = useAppRouter();
  const meta = getWorkspaceAgentGroupMeta(row.groupKey);
  const Icon = meta.icon;
  const prState = resolveSessionPrLifecycle(row.workspace, branchPrs);
  const subtitle = formatSessionRowSubtitle({
    projectName: row.projectName,
    workspaceName: row.workspaceName,
    branch: row.branch,
    prState: prState
      ? prStateLabel(prState, {
          open: chromeT("workspaceContent.prState.open"),
          draft: chromeT("workspaceContent.prState.draft"),
          merged: chromeT("workspaceContent.prState.merged"),
          closed: chromeT("workspaceContent.prState.closed"),
        })
      : null,
  });

  return (
    <button
      type="button"
      onClick={() => activateSidebarSessionRow(row, router, projects)}
      onContextMenu={(event) => {
        event.preventDefault();
        onArchive(row.sessionId);
      }}
      title={viewT("view.archive")}
      className="flex w-full flex-col gap-0.5 rounded-lg px-2 py-1.5 text-left hover:bg-sidebar-accent"
    >
      <span className="flex min-w-0 items-center gap-1.5">
        <Icon
          className={cn(
            "size-3.5 shrink-0",
            meta.className,
            row.groupKey === "running" && "animate-spin",
          )}
        />
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-sidebar-foreground">
          {row.title}
        </span>
        <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
          {formatRelativeTime(row.updatedAt, locale)}
        </span>
      </span>
      {subtitle ? (
        <span className="truncate pl-5 text-[11px] text-muted-foreground">{subtitle}</span>
      ) : null}
    </button>
  );
}

function SessionGroupSection({
  group,
  groupingMode,
  isCollapsed,
  onArchive,
  onToggle,
  projects,
  prsByKey,
}: {
  group: SidebarSessionGroup;
  groupingMode: SidebarGroupingMode;
  isCollapsed: boolean;
  onArchive: (sessionId: string) => void;
  onToggle: () => void;
  projects: Project[];
  prsByKey: ReadonlyMap<string, BranchPr[]>;
}) {
  const {
    visibleCount,
    canShowMore,
    canShowLess,
    showMore,
    showLess,
  } = useWorkspaceListVisibleCount(group.items.length, group.key);
  const visibleItems = group.items.slice(0, visibleCount);

  return (
    <section className="space-y-1.5">
      <div className={LEFT_SIDEBAR_STICKY_GROUP_HEADER_CLASS} data-sidebar-sticky-group-header="">
        <div className="group relative flex items-center rounded-lg hover:bg-sidebar-accent">
          <button
            type="button"
            onClick={onToggle}
            className="flex min-w-0 flex-1 items-center gap-1.5 py-2 pl-3 pr-2 text-left text-[11px] font-semibold tracking-[0.03em] text-muted-foreground hover:text-sidebar-accent-foreground"
          >
            <WorkspaceGroupMarker group={group} groupingMode={groupingMode} />
            <span className="truncate">{group.label}</span>
            <ChevronRight
              className={cn(
                "ml-1 size-3 shrink-0 opacity-0 transition-all duration-200 group-hover:opacity-100",
                !isCollapsed && "rotate-90",
              )}
            />
            <span className="ml-auto inline-flex size-6 shrink-0 items-center justify-center text-[10px] font-medium normal-case tracking-normal text-muted-foreground/80">
              {group.items.length}
            </span>
          </button>
        </div>
      </div>
      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-300 ease-out",
          isCollapsed ? "grid-rows-[0fr]" : "grid-rows-[1fr]",
        )}
      >
        <div className="overflow-hidden">
          <div className="space-y-1 pl-3 pt-0.5">
            {visibleItems.map((row) => {
              const owner = row.workspace?.githubPr?.owner?.trim();
              const repo = row.workspace?.githubPr?.repo?.trim();
              const branch = row.workspace?.branch?.trim();
              const key = owner && repo && branch ? `${owner}/${repo}/${branch}` : "";
              return (
                <SessionSidebarRow
                  key={row.sessionId}
                  onArchive={onArchive}
                  row={row}
                  branchPrs={key ? prsByKey.get(key) : undefined}
                  projects={projects}
                />
              );
            })}
            <WorkspaceListShowMoreLess
              canShowMore={canShowMore}
              canShowLess={canShowLess}
              onShowMore={showMore}
              onShowLess={showLess}
            />
          </div>
        </div>
      </div>
    </section>
  );
}

export function SessionSidebarList({
  catalogCount,
  collapsedWorkspaceGroups,
  groupingMode,
  groups,
  onArchiveSession,
  projects,
  sessionsLoaded,
  toggleWorkspaceGroup,
}: {
  catalogCount: number;
  collapsedWorkspaceGroups: Record<string, boolean>;
  groupingMode: SidebarGroupingMode;
  groups: SidebarSessionGroup[];
  onArchiveSession: (sessionId: string) => void;
  projects: Project[];
  sessionsLoaded: boolean;
  toggleWorkspaceGroup: (stateKey: string) => void;
}) {
  const t = useTranslations("appShell.task");
  const rows = useMemo(() => groups.flatMap((group) => group.items), [groups]);
  const prsByKey = useSessionBranchPrMap(rows);

  if (!sessionsLoaded && catalogCount === 0) return null;
  if (sessionsLoaded && catalogCount === 0) {
    return (
      <div className="px-3 py-6 text-sm text-muted-foreground">{t("view.empty")}</div>
    );
  }
  if (groups.length === 0) {
    return (
      <div className="px-3 py-6 text-sm text-muted-foreground">{t("view.noMatches")}</div>
    );
  }

  return (
    <ScrollArea scrollFade className="h-full">
      <div className={cn("space-y-0.5 pl-2", LEFT_SIDEBAR_DIVIDER_GUTTER_PR_CLASS)}>
        {groups.map((group) => {
          const stateKey = `session:${groupingMode}:${group.key}`;
          return (
            <SessionGroupSection
              key={`${groupingMode}:${group.key}`}
              group={group}
              groupingMode={groupingMode}
              isCollapsed={collapsedWorkspaceGroups[stateKey] ?? false}
              onArchive={onArchiveSession}
              onToggle={() => toggleWorkspaceGroup(stateKey)}
              projects={projects}
              prsByKey={prsByKey}
            />
          );
        })}
      </div>
    </ScrollArea>
  );
}
