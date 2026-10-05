"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useQueries } from "@tanstack/react-query";
import { Checkbox, Popover, PopoverContent, PopoverTrigger, ScrollArea, cn } from "@workspace/ui";
import { Archive, ChevronRight, Pin, Trash2 } from "lucide-react";
import { HoldToConfirmButton } from "@/features/agent-sessions/components/hold-to-confirm";
import {
  archiveLinkedHostSessions,
  deleteLinkedHostSessions,
  sidebarChatId,
} from "@/app-shell/sidebar/session-row-actions";
import { usePinnedSessionIds } from "@/app-shell/sidebar/use-pinned-session-ids";
import { formatRelativeTime } from "@atmos/shared";
import { useComputerQueryScope } from "@/api/query/query-scope";
import { WorkspaceGroupMarker } from "@/app-shell/left-sidebar-controls";
import {
  SidebarMotionItem,
  SidebarMotionList,
  SidebarMotionScope,
} from "@/app-shell/sidebar/sidebar-list-motion";
import {
  LEFT_SIDEBAR_DIVIDER_GUTTER_PR_CLASS,
  LEFT_SIDEBAR_STICKY_GROUP_HEADER_CLASS,
} from "@/app-shell/sidebar-layout-constants";
import { useCenterPaintContextId } from "@/app-shell/center-space/use-center-paint-context-id";
import { useCenterPaneLayoutStore } from "@/app-shell/center-pane/center-pane-layout-store";
import { type SidebarGroupingMode } from "@/app-shell/sidebar/workspace-status";
import { WorkspaceListShowMoreLess } from "@/app-shell/sidebar/workspace-list-pagination";
import {
  formatSessionRowSubtitle,
  sidebarSessionRowIsActive,
  splitPinnedSessionGroups,
  type SidebarSessionGroup,
  type SidebarSessionRow,
} from "@/app-shell/sidebar/session-grouping";
import {
  resolveSessionPrLifecycle,
  sessionBranchPrTargets,
} from "@/app-shell/sidebar/session-pr";
import { AgentIcon } from "@/features/agent/components/AgentIcon";
import {
  AGENT_TOOL,
  AGENT_TOOL_ICON_IDS,
  AGENT_TOOL_LABELS,
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
import { parseAgentChatTabValue } from "@/features/agent/store/use-agent-chat-center-tabs";
import { FIXED_TERMINAL_TAB_VALUE } from "@/features/terminal/lib/terminal-layout-document";
import { getScopeKey } from "@/features/terminal/store/terminal-store-helpers";
import { useTerminalStore } from "@/features/terminal/store/use-terminal-store";
import type { TerminalPaneProps } from "@/features/terminal/types";
import { useContextParams } from "@/shared/hooks/use-context-params";
import { branchPrListQueryOptions } from "@/features/github/lib/github-query-options";
import type { BranchPr } from "@/features/github/lib/github-pr-cache";
import type { WorkspacePrLifecycleState } from "@/features/github/lib/workspace-pr-status";
import type { NavigateToLocatedPaneRouter } from "@/features/terminal/public/navigate-to-located-pane";
import { useAgentChatCenterTabsStore } from "@/features/agent/store/use-agent-chat-center-tabs";
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
  if (row.draftTab) {
    useAgentChatCenterTabsStore.getState().requestActivate(
      row.draftTab.contextId,
      row.draftTab.value,
    );
    openSessionContext(row, router);
    return;
  }
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

const EMPTY_TERMINAL_IDS: readonly string[] = [];

function useActiveSidebarSession(): {
  chatId: string | null;
  terminalIds: readonly string[];
} {
  const { effectiveContextId } = useContextParams();
  const paintId = useCenterPaintContextId();
  const activeTabId = useCenterPaneLayoutStore((state) => {
    if (!paintId) return null;
    const layout = state.byContext[paintId];
    if (!layout) return null;
    const pane = layout.panes.find((item) => item.id === layout.focusedPaneId);
    const tabId = pane?.activeTabId.trim() ?? "";
    return tabId || null;
  });
  const chatId = parseAgentChatTabValue(activeTabId);
  const terminalPane = useTerminalStore((state) => {
    if (!effectiveContextId || activeTabId !== FIXED_TERMINAL_TAB_VALUE) return null;
    const scopeKey = getScopeKey(effectiveContextId, FIXED_TERMINAL_TAB_VALUE);
    const paneId = state.workspaceActivePaneIds[scopeKey];
    if (!paneId) return null;
    return state.workspacePanes[scopeKey]?.[paneId] ?? null;
  });

  return useMemo(() => {
    if (!terminalPane || !effectiveContextId) {
      return { chatId, terminalIds: EMPTY_TERMINAL_IDS };
    }
    return {
      chatId,
      terminalIds: terminalMatchIds(effectiveContextId, terminalPane),
    };
  }, [chatId, effectiveContextId, terminalPane]);
}

function terminalMatchIds(hostId: string, pane: TerminalPaneProps): string[] {
  const ids = [pane.sessionId, pane.id];
  const windowName = pane.tmuxWindowName?.trim();
  if (!windowName) return ids;
  ids.push(`${hostId}:${windowName}`);
  if (pane.workspaceId && pane.workspaceId !== hostId) {
    ids.push(`${pane.workspaceId}:${windowName}`);
  }
  return ids;
}

function sessionAgentIcon(tool: SidebarSessionRow["tool"]): {
  registryId: string;
  name: string;
} {
  if (tool && Object.hasOwn(AGENT_TOOL_ICON_IDS, tool)) {
    const typed = tool as AgentToolType;
    return {
      registryId: AGENT_TOOL_ICON_IDS[typed],
      name: AGENT_TOOL_LABELS[typed],
    };
  }
  return {
    registryId: AGENT_TOOL_ICON_IDS[AGENT_TOOL.AGENT],
    name: AGENT_TOOL_LABELS[AGENT_TOOL.AGENT],
  };
}

function SessionSidebarRow({
  isActive,
  isPinned,
  onArchive,
  onTogglePin,
  row,
  branchPrs,
  projects,
}: {
  isActive: boolean;
  isPinned: boolean;
  onArchive: (sessionId: string) => void;
  onTogglePin: (sessionId: string) => void;
  row: SidebarSessionRow;
  branchPrs: BranchPr[] | undefined;
  projects: Project[];
}) {
  const locale = useLocale();
  const viewT = useTranslations("appShell.task");
  const chromeT = useTranslations("AppShell.chrome");
  const deleteT = useTranslations("agentSessions.bulk");
  const router = useAppRouter();
  const agent = sessionAgentIcon(row.tool);
  const chatId = sidebarChatId(row);
  const [busy, setBusy] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [includeChat, setIncludeChat] = useState(true);
  const [includeSource, setIncludeSource] = useState(true);
  const [actionError, setActionError] = useState<string | null>(null);
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

  const run = async (task: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setActionError(null);
    try {
      await task();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : deleteT("failed"));
    } finally {
      setBusy(false);
    }
  };

  const activate = () => activateSidebarSessionRow(row, router, projects);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={activate}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          activate();
        }
      }}
      className={cn(
        "group/session flex w-full min-w-0 cursor-pointer flex-col gap-0.5 rounded-lg px-2 py-1.5 text-left hover:bg-sidebar-accent",
        isActive && "bg-sidebar-accent",
      )}
    >
      <span className="flex h-6 min-w-0 items-center gap-1.5">
        <span className="relative flex size-3.5 shrink-0 items-center justify-center">
          <AgentIcon
            registryId={agent.registryId}
            name={agent.name}
            size={14}
            className="group-hover/session:invisible"
          />
          <button
            type="button"
            disabled={busy}
            title={chromeT(isPinned ? "common.unpin" : "common.pin")}
            onClick={(event) => {
              event.stopPropagation();
              onTogglePin(row.sessionId);
            }}
            className="absolute left-1/2 top-1/2 z-10 hidden size-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-sm text-muted-foreground hover:cursor-pointer hover:bg-sidebar-border/50 hover:text-foreground group-hover/session:flex"
          >
            <Pin className={cn("size-3.5", !isPinned && "rotate-45")} />
          </button>
        </span>
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-sidebar-foreground">
          {row.title}
        </span>
        <span
          className={cn(
            "shrink-0 text-[11px] tabular-nums text-muted-foreground",
            chatId && "group-hover/session:hidden",
          )}
        >
          {formatRelativeTime(row.updatedAt, locale)}
        </span>
        {chatId ? (
          <span className="hidden shrink-0 items-center gap-0.5 group-hover/session:flex">
            <button
              type="button"
              disabled={busy}
              title={viewT("view.archive")}
              onClick={(event) => {
                event.stopPropagation();
                void run(async () => {
                  await archiveLinkedHostSessions(chatId);
                  await onArchive(row.sessionId);
                });
              }}
              className="flex size-6 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-sidebar-border/50 hover:text-foreground"
            >
              <Archive className="size-3.5" />
            </button>
            <Popover
              open={deleteOpen}
              onOpenChange={(open) => {
                setDeleteOpen(open);
                if (open) {
                  setIncludeChat(true);
                  setIncludeSource(true);
                  setActionError(null);
                }
              }}
            >
              <PopoverTrigger asChild>
                <button
                  type="button"
                  disabled={busy}
                  title={chromeT("common.delete")}
                  onClick={(event) => event.stopPropagation()}
                  className="flex size-6 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-sidebar-border/50 hover:text-destructive"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </PopoverTrigger>
              <PopoverContent side="top" align="end" className="w-72">
                <div className="flex flex-col gap-3">
                  <DeleteOption
                    checked={includeChat}
                    label={deleteT("includeChat")}
                    onCheckedChange={setIncludeChat}
                  />
                  <DeleteOption
                    checked={includeSource}
                    label={deleteT("includeSource")}
                    onCheckedChange={setIncludeSource}
                  />
                  {actionError ? (
                    <p className="text-xs text-destructive">{actionError}</p>
                  ) : null}
                  <HoldToConfirmButton
                    size="sm"
                    className="mt-1 w-full"
                    disabled={busy || (!includeChat && !includeSource)}
                    label={deleteT("holdToDelete")}
                    confirmedLabel={deleteT("held")}
                    resetDelay={0}
                    onConfirm={() => {
                      setDeleteOpen(false);
                      void run(async () => {
                        await deleteLinkedHostSessions(chatId, {
                          includeAtmosChat: includeChat,
                          includeSource,
                        });
                        await onArchive(row.sessionId);
                      });
                    }}
                  />
                </div>
              </PopoverContent>
            </Popover>
          </span>
        ) : null}
      </span>
      {subtitle ? (
        <span className="min-w-0 truncate pl-5 text-[11px] text-muted-foreground">{subtitle}</span>
      ) : null}
      {actionError && !deleteOpen ? (
        <span className="truncate pl-5 text-[11px] text-destructive">{actionError}</span>
      ) : null}
    </div>
  );
}

function DeleteOption({
  checked,
  label,
  onCheckedChange,
}: {
  checked: boolean;
  label: string;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 text-sm text-foreground">
      <Checkbox checked={checked} onCheckedChange={(value) => onCheckedChange(value === true)} />
      <span>{label}</span>
    </label>
  );
}

function SessionGroupSection({
  activeSession,
  group,
  groupingMode,
  isCollapsed,
  leading,
  onArchive,
  onToggle,
  onTogglePin,
  pinnedIds,
  projects,
  prsByKey,
}: {
  activeSession: { chatId: string | null; terminalIds: readonly string[] };
  group: SidebarSessionGroup;
  groupingMode: SidebarGroupingMode;
  isCollapsed: boolean;
  leading?: ReactNode;
  onArchive: (sessionId: string) => void;
  onToggle: () => void;
  onTogglePin: (sessionId: string) => void;
  pinnedIds: ReadonlySet<string>;
  projects: Project[];
  prsByKey: ReadonlyMap<string, BranchPr[]>;
}) {
  return (
    <section className="space-y-1.5">
      <div className={LEFT_SIDEBAR_STICKY_GROUP_HEADER_CLASS} data-sidebar-sticky-group-header="">
        <div className="group relative flex items-center rounded-lg hover:bg-sidebar-accent">
          <button
            type="button"
            onClick={onToggle}
            className="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 py-2 pl-3 pr-2 text-left text-[11px] font-semibold tracking-[0.03em] text-muted-foreground hover:text-sidebar-accent-foreground"
          >
            {leading ?? <WorkspaceGroupMarker group={group} groupingMode={groupingMode} />}
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
          "grid min-w-0 transition-[grid-template-rows] duration-300 ease-out",
          isCollapsed ? "grid-rows-[0fr]" : "grid-rows-[1fr]",
        )}
      >
        <div className="min-w-0 overflow-hidden">
          <div className="flex min-w-0 flex-col gap-1 pl-3 pt-0.5">
            <SidebarMotionList>
              {group.items.map((row) => {
                const owner = row.workspace?.githubPr?.owner?.trim();
                const repo = row.workspace?.githubPr?.repo?.trim();
                const branch = row.workspace?.branch?.trim();
                const key = owner && repo && branch ? `${owner}/${repo}/${branch}` : "";
                return (
                  <SidebarMotionItem key={row.sessionId}>
                    <SessionSidebarRow
                      isActive={sidebarSessionRowIsActive(row, activeSession)}
                      isPinned={pinnedIds.has(row.sessionId)}
                      onArchive={onArchive}
                      onTogglePin={onTogglePin}
                      row={row}
                      branchPrs={key ? prsByKey.get(key) : undefined}
                      projects={projects}
                    />
                  </SidebarMotionItem>
                );
              })}
            </SidebarMotionList>
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
  hasMore = false,
  onShowMore,
  onArchiveSession,
  projects,
  sessionsLoaded,
  toggleWorkspaceGroup,
}: {
  catalogCount: number;
  collapsedWorkspaceGroups: Record<string, boolean>;
  groupingMode: SidebarGroupingMode;
  groups: SidebarSessionGroup[];
  hasMore?: boolean;
  onShowMore?: () => void;
  onArchiveSession: (sessionId: string) => void;
  projects: Project[];
  sessionsLoaded: boolean;
  toggleWorkspaceGroup: (stateKey: string) => void;
}) {
  const t = useTranslations("appShell.task");
  const { pinnedIds, togglePin } = usePinnedSessionIds();
  const pinnedIdSet = useMemo(() => new Set(pinnedIds), [pinnedIds]);
  const split = useMemo(
    () => splitPinnedSessionGroups(groups, pinnedIds),
    [groups, pinnedIds],
  );
  const rows = useMemo(() => groups.flatMap((group) => group.items), [groups]);
  const prsByKey = useSessionBranchPrMap(rows);
  const activeSession = useActiveSidebarSession();

  if (!sessionsLoaded && catalogCount === 0) return null;
  if (sessionsLoaded && catalogCount === 0) {
    return (
      <div className="px-3 py-6 text-sm text-muted-foreground">{t("view.empty")}</div>
    );
  }
  if (split.groups.length === 0 && split.pinned.length === 0) {
    return (
      <div className="px-3 py-6 text-sm text-muted-foreground">{t("view.noMatches")}</div>
    );
  }

  const pinnedGroup: SidebarSessionGroup | null =
    split.pinned.length > 0
      ? { key: "__pinned__", label: t("view.pinned"), items: split.pinned }
      : null;

  return (
    <ScrollArea scrollFade className="h-full overflow-x-hidden" viewportClassName="overflow-x-hidden">
      <SidebarMotionScope className={cn("flex min-w-0 flex-col gap-0.5 overflow-x-clip pl-2", LEFT_SIDEBAR_DIVIDER_GUTTER_PR_CLASS)}>
        <SidebarMotionList>
          {pinnedGroup ? (
            <SidebarMotionItem key="session-pinned">
              <SessionGroupSection
                activeSession={activeSession}
                group={pinnedGroup}
                groupingMode={groupingMode}
                isCollapsed={collapsedWorkspaceGroups["session:pinned"] ?? false}
                leading={<Pin className="size-3.5 shrink-0" />}
                onArchive={onArchiveSession}
                onToggle={() => toggleWorkspaceGroup("session:pinned")}
                onTogglePin={togglePin}
                pinnedIds={pinnedIdSet}
                projects={projects}
                prsByKey={prsByKey}
              />
            </SidebarMotionItem>
          ) : null}
          {split.groups.map((group) => {
            const stateKey = `session:${groupingMode}:${group.key}`;
            return (
              <SidebarMotionItem key={`${groupingMode}:${group.key}`}>
                <SessionGroupSection
                  activeSession={activeSession}
                  group={group}
                  groupingMode={groupingMode}
                  isCollapsed={collapsedWorkspaceGroups[stateKey] ?? false}
                  onArchive={onArchiveSession}
                  onToggle={() => toggleWorkspaceGroup(stateKey)}
                  onTogglePin={togglePin}
                  pinnedIds={pinnedIdSet}
                  projects={projects}
                  prsByKey={prsByKey}
                />
              </SidebarMotionItem>
            );
          })}
        </SidebarMotionList>
        <WorkspaceListShowMoreLess
          canShowLess={false}
          canShowMore={hasMore}
          onShowLess={() => undefined}
          onShowMore={() => onShowMore?.()}
        />
      </SidebarMotionScope>
    </ScrollArea>
  );
}
