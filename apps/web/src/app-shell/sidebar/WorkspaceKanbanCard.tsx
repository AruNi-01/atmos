import React from "react";
import {
  Badge,
  Button,
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
  Github,
  LogIn,
  MoreHorizontal,
  Pin,
  Plus,
  Trash2,
} from "lucide-react";
import type {
  Workspace,
  WorkspaceLabel,
  WorkspacePriority,
  WorkspaceWorkflowStatus,
} from "@/shared/types/domain";
import {
  getWorkspaceWorkflowStatusMeta,
} from "@/app-shell/sidebar/workspace-status";
import {
  getWorkspacePriorityMeta,
  WorkspaceLabelBadges,
  WorkspaceLabelPicker,
  WorkspacePrioritySelect,
  WorkspaceStatusSelect,
} from "@/app-shell/sidebar/workspace-metadata-controls";
import type {
  DragItem,
  KanbanCardProperties,
} from "@/app-shell/sidebar/WorkspaceKanbanTypes";

export function KanbanWorkspaceCard({
  workspace,
  projectId,
  projectName,
  cardProperties,
  showUnpinnedBorder = false,
  onEnterWorkspace,
  availableLabels,
  onUpdateWorkflowStatus,
  onUpdatePriority,
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
  cardProperties: KanbanCardProperties;
  showUnpinnedBorder?: boolean;
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
  const isIssueOnly = workspace.createSource === "issue_only";
  const workspaceTitle = isIssueOnly && workspace.githubIssue
    ? `#${workspace.githubIssue.number} ${workspace.githubIssue.title}`
    : workspace.name;
  const labelsToRender = workspace.labels.length > 0
    ? workspace.labels
    : isIssueOnly
      ? (workspace.githubIssue?.labels ?? []).map((label) => ({
        id: `${workspace.id}:${label.name}`,
        name: label.name,
        color: label.color ? `#${label.color.replace(/^#/, "")}` : "#94a3b8",
        source: "gitHub_issue" as const,
      }))
      : workspace.labels;
  const handlePinClick = (event: React.MouseEvent) => {
    event.stopPropagation();
    if (workspace.isPinned) {
      void onUnpinWorkspace(projectId, workspace.id);
    } else {
      void onPinWorkspace(projectId, workspace.id);
    }
  };

  return (
    <div className={cn(
      "w-full rounded-md bg-background p-3 text-left shadow-xs",
      isIssueOnly
        ? "border border-border/50"
        : workspace.isPinned
          ? "border border-border"
          : showUnpinnedBorder
            ? "border border-border/50"
            : "",
    )}>
      {cardProperties.project || cardProperties.priority || cardProperties.status ? (
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
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
              <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                {projectName}
                {workspace.createSource === "issue_only" && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          if (workspace.githubIssue?.url) {
                            window.open(workspace.githubIssue.url, "_blank");
                          }
                        }}
                        className="cursor-pointer"
                      >
                        <Github className="size-3 text-muted-foreground" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      <p>GitHub Issue Only Workspace</p>
                    </TooltipContent>
                  </Tooltip>
                )}
              </span>
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
              title={workspace.isPinned ? "Unpin" : "Pin"}
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
                    title="More"
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
                      Archive
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
                      Delete
                    </button>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </div>
        </div>
      ) : null}

      {cardProperties.workspace_name ? <h3 className="mb-2 line-clamp-2 text-sm font-semibold">{workspaceTitle}</h3> : null}
      {cardProperties.display_name && workspace.displayName?.trim() ? (
        <div className="mb-3 text-xs text-muted-foreground">{workspace.displayName}</div>
      ) : null}

      {cardProperties.labels ? (
        <div className="mb-3 flex min-h-[1.5rem] flex-wrap items-center gap-1.5">
          <WorkspaceLabelPicker
            labels={workspace.labels}
            availableLabels={availableLabels}
            onChange={(nextLabels) => onUpdateLabels(projectId, workspace.id, nextLabels)}
            onCreateLabel={onCreateLabel}
            onUpdateLabel={onUpdateLabel}
            contentSide="right"
          />
          <WorkspaceLabelBadges labels={labelsToRender} className="contents" />
        </div>
      ) : null}

      <div className="mt-auto flex items-center justify-between pt-2">
        {cardProperties.last_visit ? (
          <span className="text-xs text-muted-foreground">{formatRelativeTime(workspace.lastVisitedAt ?? workspace.createdAt)}</span>
        ) : <span />}
        {cardProperties.enter_button ? (
          <div className="flex items-center gap-1">
            {workspace.createSource === "issue_only" ? (
              <Button
                size="sm"
                variant="default"
                className="size-7 p-0"
                onClick={() => {
                  onEnterWorkspace(projectId, workspace.id);
                }}
                aria-label="Build workspace from issue"
              >
                <Plus className="size-3.5" />
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                className="size-7 p-0"
                onClick={() => {
                  onEnterWorkspace(projectId, workspace.id);
                }}
                aria-label="Enter workspace"
              >
                <LogIn className="size-3.5" />
              </Button>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function DraggableWorkspaceCard(props: React.ComponentProps<typeof KanbanWorkspaceCard> & { isRecentlyDropped?: boolean }) {
  const { isRecentlyDropped, ...cardProps } = props;
  const dragItem = React.useMemo<DragItem>(() => ({
    id: cardProps.workspace.id,
    projectId: cardProps.projectId,
    status: cardProps.workspace.workflowStatus,
    preview: {
      projectName: cardProps.projectName,
      workspaceName: cardProps.workspace.name,
      displayName: cardProps.workspace.displayName,
      priority: cardProps.workspace.priority,
      workflowStatus: cardProps.workspace.workflowStatus,
      labels: cardProps.workspace.labels,
      lastVisitedAt: cardProps.workspace.lastVisitedAt,
      createdAt: cardProps.workspace.createdAt,
    },
  }), [cardProps.projectId, cardProps.projectName, cardProps.workspace]);
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `workspace:${cardProps.workspace.id}`,
    data: { item: dragItem },
  });

  const nodeRef = React.useRef<HTMLDivElement>(null);

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
      {...listeners}
      className={cn(
        "relative z-0",
        isDragging && "z-50",
      )}
      style={{ opacity: isDragging ? 0.3 : 1, cursor: "grab" }}
    >
      <div className={cn(
        "transition-all duration-500 ease-out rounded-md",
        isDragging && "scale-[1.01] shadow-lg ring-1 ring-border/40",
        isRecentlyDropped && "bg-primary/20 ring-2 ring-primary animate-pulse",
      )}>
        <KanbanWorkspaceCard {...cardProps} />
      </div>
    </div>
  );
}

export function KanbanDragPreview({ item }: { item: DragItem }) {
  const priorityOption = getWorkspacePriorityMeta(item.preview.priority);
  const statusMeta = getWorkspaceWorkflowStatusMeta(item.preview.workflowStatus);
  const PriorityIcon = priorityOption.icon;
  const StatusIcon = statusMeta.icon;

  return (
    <div className="w-[348px] origin-[20%_20%] rotate-[2.6deg]">
      <div className="rounded-md border border-border bg-background p-3 shadow-2xl ring-1 ring-border/40">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="inline-flex size-6 items-center justify-center rounded-md border border-border/60 bg-muted/35">
              <PriorityIcon className={cn("shrink-0", priorityOption.className)} />
            </span>
            <span className="text-sm font-medium text-foreground">{item.preview.projectName}</span>
          </div>
          <span className="inline-flex size-6 items-center justify-center rounded-md bg-muted/35">
            <StatusIcon className={cn("size-3.5 shrink-0", statusMeta.className)} />
          </span>
        </div>
        <h3 className="mb-2 line-clamp-2 text-sm font-semibold">{item.preview.workspaceName}</h3>
        {item.preview.displayName?.trim() ? (
          <div className="mb-3 text-xs text-muted-foreground">{item.preview.displayName}</div>
        ) : null}
        <div className="mb-3 flex min-h-[1.5rem] flex-wrap items-center gap-1.5">
          {item.preview.labels.slice(0, 4).map((label) => (
            <Badge key={label.id} variant="outline" className="gap-1.5 rounded-full bg-background text-muted-foreground">
              <span className="size-1.5 rounded-full" style={{ backgroundColor: label.color }} aria-hidden="true" />
              {label.name}
            </Badge>
          ))}
        </div>
        <div className="mt-auto flex items-center justify-between pt-2">
          <span className="text-xs text-muted-foreground">
            {formatRelativeTime(item.preview.lastVisitedAt ?? item.preview.createdAt)}
          </span>
        </div>
      </div>
    </div>
  );
}

export function DroppableColumn({
  status,
  activeDragItem,
  children,
}: {
  status: WorkspaceWorkflowStatus;
  activeDragItem: DragItem | null;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `kanban-status:${status}`,
    data: { status },
  });
  const isValidTarget = isOver && activeDragItem?.status !== status;

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "scrollbar-on-hover relative min-h-0 flex-1 space-y-2 overflow-y-auto p-2 transition-colors",
        isValidTarget && "bg-muted/30",
      )}
    >
      {children}
    </div>
  );
}
