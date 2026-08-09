import React from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  cn,
  useDraggable,
  useDroppable,
} from "@workspace/ui";
import { formatRelativeTime } from "@atmos/shared";
import {
  Archive,
  MoreHorizontal,
  Pin,
  Timer,
  Trash2,
} from "lucide-react";
import { WorkspaceAgentStatusMark } from "@/features/agent/components/WorkspaceAgentStatusMark";
import { WorkspacePrSummary } from "@/features/github/components/WorkspacePrSummary";
import { useWorkspacePrStatus } from "@/features/github/hooks/use-workspace-pr-status";
import { useOpenGithubCenterTab } from "@/features/github/hooks/use-open-github-center-tab";
import {
  buildActionRunFromChecks,
  pickGroupActionTarget,
} from "@/features/github/lib/pr-detail-parts";
import type {
  Group,
  Workspace,
  WorkspaceLabel,
  WorkspacePriority,
  WorkspaceWorkflowStatus,
} from "@/shared/types/domain";
import {
  WorkspaceGroupSelect,
  WorkspaceLabelBadges,
  WorkspaceLabelPicker,
  WorkspacePrioritySelect,
  WorkspaceStatusSelect,
} from "@/app-shell/sidebar/workspace-metadata-controls";
import type {
  DragItem,
  KanbanCardProperties,
} from "@/app-shell/sidebar/WorkspaceKanbanTypes";
import { resolveWorkspaceGroupId } from "@/app-shell/sidebar/kanban-columns";

/**
 * Nested interactive controls should not trigger click-to-enter.
 * Ignores the card root itself (which may be role=button for a11y).
 */
function isNestedInteractiveTarget(
  target: EventTarget | null,
  cardRoot: EventTarget | null,
): boolean {
  if (!(target instanceof Element) || !(cardRoot instanceof Element)) return false;
  const interactive = target.closest(
    "button, a, input, textarea, select, [role='menuitem'], [role='option'], [data-radix-collection-item]",
  );
  return Boolean(interactive && interactive !== cardRoot && cardRoot.contains(interactive));
}

export function KanbanWorkspaceCard({
  workspace,
  projectId,
  projectName,
  projectPath,
  cardProperties,
  showUnpinnedBorder = false,
  groups = [],
  sourceColumnKey,
  dragDisabled = false,
  onEnterWorkspace,
  availableLabels,
  onUpdateWorkflowStatus,
  onUpdatePriority,
  onSetWorkspaceGroup,
  onCreateGroup,
  onCreateLabel,
  onUpdateLabel,
  onUpdateLabels,
  onPinWorkspace,
  onUnpinWorkspace,
  onArchiveWorkspace,
  onDeleteWorkspace,
}: {
  workspace: Workspace;
  projectId: string;
  projectName: string;
  /** Project root — used to resolve github owner/repo when workspace has no stored githubPr. */
  projectPath?: string;
  cardProperties: KanbanCardProperties;
  showUnpinnedBorder?: boolean;
  groups?: Group[];
  sourceColumnKey?: string;
  dragDisabled?: boolean;
  onEnterWorkspace: (projectId: string, workspaceId: string) => void;
  availableLabels: WorkspaceLabel[];
  onUpdateWorkflowStatus: (
    projectId: string,
    workspaceId: string,
    workflowStatus: WorkspaceWorkflowStatus,
  ) => Promise<void>;
  onUpdatePriority: (
    projectId: string,
    workspaceId: string,
    priority: WorkspacePriority,
  ) => Promise<void>;
  onSetWorkspaceGroup?: (workspaceId: string, groupId: string | null) => Promise<void> | void;
  onCreateGroup?: (name: string) => Promise<{ id: string } | void> | { id: string } | void;
  onCreateLabel: (data: { name: string; color: string }) => Promise<WorkspaceLabel>;
  onUpdateLabel: (labelId: string, data: { name: string; color: string }) => Promise<WorkspaceLabel>;
  onUpdateLabels: (
    projectId: string,
    workspaceId: string,
    labels: WorkspaceLabel[],
  ) => Promise<void>;
  onPinWorkspace: (projectId: string, workspaceId: string) => Promise<void>;
  onUnpinWorkspace: (projectId: string, workspaceId: string) => Promise<void>;
  onArchiveWorkspace?: (projectId: string, workspaceId: string) => Promise<void>;
  onDeleteWorkspace?: (projectId: string, workspaceId: string) => Promise<void>;
}) {
  const t = useTranslations("AppShell.chrome");
  const locale = useLocale();
  const { openPullRequestTab, openActionRunTab } = useOpenGithubCenterTab();
  const isAutomation = workspace.createSource === "automation";
  const workspaceTitle = workspace.name;
  const workspaceGroupId = resolveWorkspaceGroupId(groups, projectId, workspace.id);
  const prRepoPath = workspace.localPath?.trim() || projectPath?.trim() || null;
  const { presentation: managedPr } = useWorkspacePrStatus({
    githubPr: workspace.githubPr,
    branch: workspace.branch,
    repoPath: prRepoPath,
    interested: cardProperties.pull_request,
  });
  const openManagedPullRequest = React.useCallback(() => {
    if (!managedPr) return;
    openPullRequestTab({
      owner: managedPr.owner,
      repo: managedPr.repo,
      prNumber: managedPr.number,
      title: managedPr.title,
      branch: workspace.branch,
      contextId: workspace.id,
    });
  }, [managedPr, openPullRequestTab, workspace.branch, workspace.id]);

  const openManagedChecks = React.useCallback(() => {
    if (!managedPr) return;
    const target = pickGroupActionTarget(managedPr.checks);
    if (target.runId != null) {
      openActionRunTab({
        owner: managedPr.owner,
        repo: managedPr.repo,
        runId: target.runId,
        run: buildActionRunFromChecks(
          target.groupName,
          managedPr.checks,
          target.runId,
          managedPr.owner,
          managedPr.repo,
        ),
        contextId: workspace.id,
      });
      return;
    }
    openPullRequestTab({
      owner: managedPr.owner,
      repo: managedPr.repo,
      prNumber: managedPr.number,
      title: managedPr.title,
      branch: workspace.branch,
      contextId: workspace.id,
    });
  }, [
    managedPr,
    openActionRunTab,
    openPullRequestTab,
    workspace.branch,
    workspace.id,
  ]);
  const labelsToRender = workspace.labels;
  const handlePinClick = (event: React.MouseEvent) => {
    event.stopPropagation();
    if (workspace.isPinned) {
      void onUnpinWorkspace(projectId, workspace.id);
    } else {
      void onPinWorkspace(projectId, workspace.id);
    }
  };

  const handleCardClick = (event: React.MouseEvent) => {
    if (isNestedInteractiveTarget(event.target, event.currentTarget)) return;
    onEnterWorkspace(projectId, workspace.id);
  };

  const showFooter =
    (cardProperties.pull_request && Boolean(managedPr)) || cardProperties.last_visit;

  return (
    <div
      role="button"
      tabIndex={0}
      className={cn(
        "w-full cursor-pointer rounded-md bg-background p-3 text-left shadow-xs outline-none",
        "focus-visible:ring-1 focus-visible:ring-ring",
        workspace.isPinned
          ? "border border-border"
          : showUnpinnedBorder
            ? "border border-border/50"
            : "",
      )}
      onClick={handleCardClick}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onEnterWorkspace(projectId, workspace.id);
        }
      }}
    >
      {cardProperties.project || cardProperties.priority || cardProperties.status || !cardProperties.workspace_name ? (
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            {cardProperties.priority ? (
              <WorkspacePrioritySelect
                value={workspace.priority}
                onChange={(value) => void onUpdatePriority(projectId, workspace.id, value)}
                triggerVariant="icon"
                contentSide="right"
                triggerClassName="size-6 border border-border/60 bg-muted/35"
              />
            ) : null}
            {cardProperties.project ? (
              <span className="flex min-w-0 items-center gap-1.5 text-sm font-medium text-foreground">
                {projectName}
                {isAutomation && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span
                        className="inline-flex cursor-default items-center"
                        aria-label={t("workspaceContent.automationWorkspace")}
                      >
                        <Timer className="size-3 text-muted-foreground" />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      <p>{t("workspaceContent.automationWorkspace")}</p>
                    </TooltipContent>
                  </Tooltip>
                )}
              </span>
            ) : null}
            {/* When workspace title is hidden, keep agent status scannable on the header row. */}
            {!cardProperties.workspace_name && cardProperties.agent_status ? (
              <WorkspaceAgentStatusMark contextId={workspace.id} />
            ) : null}
          </div>
          <div className="flex items-center gap-1">
            {cardProperties.status ? (
              <WorkspaceStatusSelect
                value={workspace.workflowStatus}
                onChange={(value) => void onUpdateWorkflowStatus(projectId, workspace.id, value)}
                triggerVariant="icon"
                contentSide="right"
                triggerClassName="size-6 bg-muted/35"
              />
            ) : null}
            <button
              type="button"
              onClick={handlePinClick}
              className={cn(
                "inline-flex size-6 items-center justify-center rounded-md transition-colors hover:bg-accent",
                workspace.isPinned
                  ? "text-foreground"
                  : "text-muted-foreground/50 hover:text-foreground",
              )}
              title={workspace.isPinned ? t("common.unpin") : t("common.pin")}
            >
              <Pin className={cn("size-3.5", workspace.isPinned ? "" : "rotate-45")} />
            </button>
            {onArchiveWorkspace || onDeleteWorkspace ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    onClick={(event) => event.stopPropagation()}
                    className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    title={t("common.more")}
                  >
                    <MoreHorizontal className="size-3.5" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" side="bottom">
                  {onArchiveWorkspace ? (
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        void onArchiveWorkspace(projectId, workspace.id);
                      }}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-foreground transition-colors hover:bg-accent"
                    >
                      <Archive className="size-3.5" />
                      {t("common.archive")}
                    </button>
                  ) : null}
                  {onDeleteWorkspace ? (
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        void onDeleteWorkspace(projectId, workspace.id);
                      }}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-destructive transition-colors hover:bg-accent"
                    >
                      <Trash2 className="size-3.5" />
                      {t("common.delete")}
                    </button>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </div>
        </div>
      ) : null}

      {cardProperties.workspace_name ? (
        <div className="mb-2 flex items-start gap-2">
          <div className="flex min-w-0 flex-1 items-start gap-1.5">
            <h3 className="min-w-0 flex-1 line-clamp-2 text-sm font-semibold">{workspaceTitle}</h3>
            {cardProperties.agent_status ? (
              <WorkspaceAgentStatusMark
                contextId={workspace.id}
                className="mt-0.5"
              />
            ) : null}
          </div>
          {cardProperties.group ? (
            <div
              className="max-w-[45%] shrink-0"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => event.stopPropagation()}
            >
              <WorkspaceGroupSelect
                value={workspaceGroupId}
                groups={groups}
                onChange={
                  onSetWorkspaceGroup
                    ? (groupId) => void onSetWorkspaceGroup(workspace.id, groupId)
                    : undefined
                }
                onCreateGroup={
                  onCreateGroup
                    ? async (name) => {
                        const created = await onCreateGroup(name);
                        if (created?.id && onSetWorkspaceGroup) {
                          await onSetWorkspaceGroup(workspace.id, created.id);
                        }
                        return created;
                      }
                    : undefined
                }
                contentSide="bottom"
                contentAlign="end"
                triggerClassName="h-6 max-w-full border-border/60 bg-muted/40 px-1.5 text-[10px]"
                iconClassName="size-3"
                labelClassName="text-[10px]"
              />
            </div>
          ) : null}
        </div>
      ) : null}
      {cardProperties.display_name && workspace.displayName?.trim() ? (
        <div className="mb-3 text-xs text-muted-foreground">{workspace.displayName}</div>
      ) : null}

      {cardProperties.labels ? (
        <div className="mb-3 flex min-h-[1.5rem] flex-wrap items-center gap-1.5">
          <WorkspaceLabelBadges labels={labelsToRender} className="contents" />
          <WorkspaceLabelPicker
            labels={workspace.labels}
            availableLabels={availableLabels}
            onChange={(nextLabels) => onUpdateLabels(projectId, workspace.id, nextLabels)}
            onCreateLabel={onCreateLabel}
            onUpdateLabel={onUpdateLabel}
            contentSide="right"
          />
        </div>
      ) : null}

      {showFooter ? (
        <div className="mt-auto flex items-center justify-between gap-2 pt-2">
          <div
            className="min-w-0 flex-1"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
          >
            {cardProperties.pull_request && managedPr ? (
              <WorkspacePrSummary
                presentation={managedPr}
                onOpenPr={openManagedPullRequest}
                onOpenChecks={openManagedChecks}
                ringSize={14}
                compact
                className="-mx-1"
              />
            ) : null}
          </div>
          {cardProperties.last_visit ? (
            <span className="shrink-0 text-xs text-muted-foreground">
              {formatRelativeTime(workspace.lastVisitedAt ?? workspace.createdAt, locale)}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function DraggableWorkspaceCard(props: React.ComponentProps<typeof KanbanWorkspaceCard> & {
  isRecentlyDropped?: boolean;
  sourceColumnKey: string;
}) {
  const { isRecentlyDropped, sourceColumnKey, dragDisabled, ...cardProps } = props;
  const dragItem = React.useMemo<DragItem>(() => ({
    id: cardProps.workspace.id,
    projectId: cardProps.projectId,
    status: cardProps.workspace.workflowStatus,
    priority: cardProps.workspace.priority,
    sourceColumnKey,
    preview: {
      projectName: cardProps.projectName,
      workspace: cardProps.workspace,
    },
  }), [cardProps.projectId, cardProps.projectName, cardProps.workspace, sourceColumnKey]);
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `workspace:${cardProps.workspace.id}:${sourceColumnKey}`,
    data: { item: dragItem },
    disabled: dragDisabled,
  });

  const nodeRef = React.useRef<HTMLDivElement>(null);
  /** After a real drag, suppress the synthetic click so we don't enter the workspace. */
  const suppressClickRef = React.useRef(false);

  React.useEffect(() => {
    if (isDragging) {
      suppressClickRef.current = true;
    }
  }, [isDragging]);

  React.useEffect(() => {
    if (isRecentlyDropped && nodeRef.current) {
      setTimeout(() => {
        nodeRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 50);
    }
  }, [isRecentlyDropped]);

  return (
    <div
      ref={(node) => {
        nodeRef.current = node;
        setNodeRef(node);
      }}
      {...attributes}
      {...(dragDisabled ? {} : listeners)}
      className={cn(
        "relative z-0 cursor-pointer",
        isDragging && "z-50 cursor-grabbing",
      )}
      style={{ opacity: isDragging ? 0.3 : 1 }}
      onClickCapture={(event) => {
        if (!suppressClickRef.current) return;
        suppressClickRef.current = false;
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      <div className={cn(
        "rounded-md",
        isRecentlyDropped && "bg-primary/20 ring-2 ring-primary animate-pulse transition-all duration-500 ease-out",
      )}>
        <KanbanWorkspaceCard
          {...cardProps}
          sourceColumnKey={sourceColumnKey}
          dragDisabled={dragDisabled}
        />
      </div>
    </div>
  );
}

const noopAsync = async () => {};
const noopEnter = () => {};

/**
 * Full-card drag overlay so chrome matches the source (pin, more, group, PR/CI, labels).
 * Handlers are inert — this is visual only.
 */
export function KanbanDragPreview({
  item,
  cardProperties,
  groups = [],
  availableLabels = [],
}: {
  item: DragItem;
  cardProperties: KanbanCardProperties;
  groups?: Group[];
  availableLabels?: WorkspaceLabel[];
}) {
  return (
    <div className="w-full origin-[20%_20%] rotate-[2.6deg] rounded-md shadow-2xl ring-1 ring-border/40">
      <KanbanWorkspaceCard
        workspace={item.preview.workspace}
        projectId={item.projectId}
        projectName={item.preview.projectName}
        cardProperties={cardProperties}
        groups={groups}
        availableLabels={availableLabels}
        dragDisabled
        onEnterWorkspace={noopEnter}
        onUpdateWorkflowStatus={noopAsync}
        onUpdatePriority={noopAsync}
        onCreateLabel={async (data) => ({
          id: `preview:${data.name}`,
          name: data.name,
          color: data.color,
          source: "manual",
        })}
        onUpdateLabel={async (labelId, data) => ({
          id: labelId,
          name: data.name,
          color: data.color,
          source: "manual",
        })}
        onUpdateLabels={noopAsync}
        onPinWorkspace={noopAsync}
        onUnpinWorkspace={noopAsync}
        onArchiveWorkspace={noopAsync}
        onDeleteWorkspace={noopAsync}
      />
    </div>
  );
}

export function DroppableColumn({
  columnKey,
  activeDragItem,
  dropDisabled = false,
  className,
  style,
  children,
}: {
  columnKey: string;
  activeDragItem: DragItem | null;
  dropDisabled?: boolean;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `kanban-column:${columnKey}`,
    data: { columnKey },
    disabled: dropDisabled,
  });
  const isValidTarget =
    !dropDisabled && isOver && activeDragItem?.sourceColumnKey !== columnKey;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn("relative", className)}
    >
      {/*
        Always mounted so opacity can fade. Column uses inline backgroundColor
        for status tint, so a Tailwind bg-* on the root would lose to that.
      */}
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-0 z-0 rounded-[inherit] bg-primary/10",
          "transition-opacity duration-200 ease-out",
          isValidTarget ? "opacity-100" : "opacity-0",
        )}
      />
      <div className="relative z-[1] flex h-full min-h-0 flex-1 flex-col">
        {children}
      </div>
    </div>
  );
}
