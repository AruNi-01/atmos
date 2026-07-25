"use client";

import React, { useState } from "react";
import { useTranslations } from "next-intl";
import {
  CSS,
  DndContext,
  DragOverlay,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  Popover,
  PopoverContent,
  PopoverTrigger,
  SortableContext,
  arrayMove,
  closestCenter,
  cn,
  defaultDropAnimationSideEffects,
  restrictToVerticalAxis,
  restrictToWindowEdges,
  useSortable,
  verticalListSortingStrategy,
} from "@workspace/ui";
import type { DragEndEvent, DndContextProps } from "@workspace/ui";
import {
  ChevronRight,
  FolderOpen,
  FolderPlus,
  Folders,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import type { FlattenedWorkspaceEntry } from "@/app-shell/sidebar/workspace-grouping";
import {
  countUserGroupItems,
  UNGROUPED_USER_GROUP_KEY,
  type UserGroupView,
} from "@/app-shell/sidebar/user-groups";
import { GroupNamePopoverForm } from "@/app-shell/sidebar/GroupNamePopoverForm";
import { ProjectItem, type ProjectItemProps } from "@/app-shell/sidebar/ProjectItem";
import { TwoColumnSidebarToggleButton } from "@/app-shell/left-sidebar-controls";

type DndSensors = DndContextProps["sensors"];

type ProjectItemSharedProps = Omit<
  ProjectItemProps,
  | "project"
  | "isExpanded"
  | "onToggle"
  | "hideWorkspaceList"
  | "onProjectRowClick"
  | "isSelected"
  | "isDragging"
  | "isPlaceholder"
  | "isAnyProjectDragging"
  | "attributes"
  | "listeners"
  | "disableRowClick"
  | "isActiveProject"
  | "workspaceSortingDisabled"
> & {
  activeProjectId?: string | null;
};

function CreateGroupPopoverButton({
  variant,
  onCreate,
}: {
  variant: "icon" | "labeled";
  onCreate: (name: string) => Promise<unknown> | void;
}) {
  const t = useTranslations("appShell.groups");
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {variant === "icon" ? (
          <button
            type="button"
            className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground"
            title={t("create")}
            data-testid="create-group-button"
          >
            <Plus className="size-3.5" />
          </button>
        ) : (
          <button
            type="button"
            className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-[11px] text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground"
            data-testid="create-group-button"
          >
            <FolderPlus className="size-3.5" />
            {t("create")}
          </button>
        )}
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="end"
        sideOffset={6}
        className="w-56 p-2"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <GroupNamePopoverForm
          mode="create"
          onCancel={() => setOpen(false)}
          onSubmit={async (name) => {
            await onCreate(name);
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

/** Count and ··· share one slot; hover / open menu swaps count → actions. */
function GroupRowTrailing({
  count,
  canManage,
  hoverScope,
  groupId,
  groupName,
  onRename,
  onDelete,
  renameLabel,
  deleteLabel,
}: {
  count: number;
  canManage: boolean;
  hoverScope: "row" | "header";
  groupId: string | null;
  groupName: string;
  onRename: (groupId: string, name: string) => Promise<void> | void;
  onDelete: () => Promise<void> | void;
  renameLabel: string;
  deleteLabel: string;
}) {
  const t = useTranslations("appShell.groups");
  const [menuOpen, setMenuOpen] = useState(false);
  /** Keep rename/delete submenus open so parent ··· menu stays mounted. */
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const countHideOnHover =
    hoverScope === "row" ? "group-hover/row:opacity-0" : "group-hover/header:opacity-0";
  const buttonShowOnHover =
    hoverScope === "row" ? "group-hover/row:opacity-100" : "group-hover/header:opacity-100";

  return (
    <div className="relative mr-1 flex size-6 shrink-0 items-center justify-center">
      <span
        className={cn(
          "text-[10px] font-medium normal-case tracking-normal text-muted-foreground/80 transition-opacity",
          canManage && (menuOpen ? "opacity-0" : countHideOnHover),
        )}
      >
        {count}
      </span>
      {canManage && groupId ? (
        <DropdownMenu
          modal={false}
          open={menuOpen}
          onOpenChange={(open) => {
            setMenuOpen(open);
            if (!open) {
              setRenameOpen(false);
              setDeleteOpen(false);
              setDeleteBusy(false);
            }
          }}
        >
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={cn(
                "absolute inset-0 z-10 inline-flex items-center justify-center rounded-md text-muted-foreground transition-opacity hover:bg-sidebar-accent hover:text-sidebar-foreground",
                menuOpen ? "opacity-100" : cn("opacity-0", buttonShowOnHover),
              )}
              aria-label="Group actions"
            >
              <MoreHorizontal className="size-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            // Fit labels like "Rename Group" on one line (locale-aware width).
            className="w-max min-w-[10rem]"
            onCloseAutoFocus={(event) => event.preventDefault()}
          >
            <DropdownMenuSub
              open={renameOpen}
              // Close via Radix; open only on click (ignore hover-open).
              onOpenChange={(open) => {
                if (!open) setRenameOpen(false);
              }}
            >
              <DropdownMenuSubTrigger
                className="cursor-pointer hover:bg-accent focus:bg-accent data-[state=open]:bg-accent [&>svg:last-child]:hidden"
                onClick={(event) => {
                  event.preventDefault();
                  setDeleteOpen(false);
                  setRenameOpen((prev) => !prev);
                }}
              >
                <Pencil className="size-3.5" />
                {renameLabel}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent
                className="w-56 p-2"
                onKeyDown={(event) => event.stopPropagation()}
                onClick={(event) => event.stopPropagation()}
              >
                <GroupNamePopoverForm
                  key={`${groupId}:${groupName}:rename`}
                  mode="rename"
                  initialName={groupName}
                  onCancel={() => setRenameOpen(false)}
                  onSubmit={async (name) => {
                    await onRename(groupId, name);
                    setRenameOpen(false);
                    setMenuOpen(false);
                  }}
                />
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSeparator />
            <DropdownMenuSub
              open={deleteOpen}
              onOpenChange={(open) => {
                if (!open) {
                  setDeleteOpen(false);
                  setDeleteBusy(false);
                }
              }}
            >
              <DropdownMenuSubTrigger
                className="cursor-pointer text-destructive hover:bg-destructive/10 focus:bg-destructive/10 focus:text-destructive data-[state=open]:bg-destructive/10 data-[state=open]:text-destructive [&>svg:last-child]:hidden [&_svg:not([class*='text-'])]:text-destructive"
                onClick={(event) => {
                  event.preventDefault();
                  setRenameOpen(false);
                  setDeleteOpen((prev) => !prev);
                }}
              >
                <Trash2 className="size-3.5" />
                {deleteLabel}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent
                className="w-56 p-2"
                onKeyDown={(event) => event.stopPropagation()}
                onClick={(event) => event.stopPropagation()}
              >
                <div className="space-y-2" data-testid="group-delete-confirm">
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    {t("deleteConfirm")}
                  </p>
                  <div className="flex justify-end gap-1.5">
                    <button
                      type="button"
                      className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
                      onClick={() => setDeleteOpen(false)}
                      disabled={deleteBusy}
                    >
                      {t("cancel")}
                    </button>
                    <button
                      type="button"
                      className="rounded-md bg-destructive px-2 py-1 text-xs text-destructive-foreground disabled:opacity-50"
                      disabled={deleteBusy}
                      data-testid="group-delete-confirm-submit"
                      onClick={() => {
                        void (async () => {
                          setDeleteBusy(true);
                          try {
                            await onDelete();
                            setDeleteOpen(false);
                            setMenuOpen(false);
                          } finally {
                            setDeleteBusy(false);
                          }
                        })();
                      }}
                    >
                      {deleteLabel}
                    </button>
                  </div>
                </div>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  );
}

function SortableUserGroupTwoColumnRow({
  view,
  isSelected,
  onSelect,
  onRenameGroup,
  onDeleteGroup,
}: {
  view: UserGroupView;
  isSelected: boolean;
  onSelect: (key: string) => void;
  onRenameGroup: (groupId: string, name: string) => Promise<void> | void;
  onDeleteGroup: (groupId: string) => Promise<void> | void;
}) {
  const t = useTranslations("appShell.groups");
  const canSort = Boolean(view.groupId);
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: view.key, disabled: !canSort });
  const count = countUserGroupItems(view);

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Translate.toString(transform),
        transition,
      }}
      className={cn(
        "group/row flex w-full items-center gap-0.5 rounded-lg transition-colors",
        isSelected
          ? "bg-sidebar-accent text-sidebar-foreground"
          : "text-muted-foreground hover:bg-sidebar-accent/40 hover:text-sidebar-foreground",
        // Match project drag: placeholder opacity while reordering.
        isDragging ? "relative z-20 opacity-20" : "opacity-100",
      )}
    >
      {/* Project pattern: plain div host for attributes/listeners (not a button). */}
      <div
        {...(canSort ? { ...attributes, ...listeners } : {})}
        className={cn(
          "flex min-w-0 flex-1 select-none items-center gap-1.5 px-3 py-2 text-left text-[11px] font-semibold tracking-[0.03em]",
          "cursor-pointer",
        )}
        data-testid={`user-group-row-${view.key}`}
        onClick={() => onSelect(view.key)}
      >
        <span className="truncate">{view.label}</span>
      </div>
      <GroupRowTrailing
        count={count}
        canManage={Boolean(view.groupId)}
        hoverScope="row"
        groupId={view.groupId}
        groupName={view.label}
        renameLabel={t("rename")}
        deleteLabel={t("delete")}
        onRename={onRenameGroup}
        onDelete={async () => {
          if (!view.groupId) return;
          await onDeleteGroup(view.groupId);
        }}
      />
    </div>
  );
}

export function UserGroupTwoColumnLeftContent({
  views,
  selectedKey,
  onSelect,
  onCreateGroup,
  onRenameGroup,
  onDeleteGroup,
  sensors,
  onGroupOrderChange,
}: {
  views: UserGroupView[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
  onCreateGroup: (name: string) => Promise<unknown> | void;
  onRenameGroup: (groupId: string, name: string) => Promise<void> | void;
  onDeleteGroup: (groupId: string) => Promise<void> | void;
  sensors?: DndSensors;
  onGroupOrderChange?: (orderedGroupIds: string[]) => void | Promise<void>;
}) {
  const t = useTranslations("appShell.groups");
  const sortableIds = views
    .filter((view) => view.groupId)
    .map((view) => view.key);
  const canReorder = Boolean(sensors && onGroupOrderChange && sortableIds.length > 1);

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!canReorder || !over || active.id === over.id || !onGroupOrderChange) return;
    const oldIndex = sortableIds.indexOf(String(active.id));
    const newIndex = sortableIds.indexOf(String(over.id));
    if (oldIndex === -1 || newIndex === -1) return;
    void onGroupOrderChange(arrayMove(sortableIds, oldIndex, newIndex));
  };

  const list = (
    <div className="space-y-1">
      {views.map((view) =>
        canReorder && view.groupId ? (
          <SortableUserGroupTwoColumnRow
            key={view.key}
            view={view}
            isSelected={selectedKey === view.key}
            onSelect={onSelect}
            onRenameGroup={onRenameGroup}
            onDeleteGroup={onDeleteGroup}
          />
        ) : (
          <div
            key={view.key}
            className={cn(
              "group/row flex w-full items-center gap-0.5 rounded-lg transition-colors",
              selectedKey === view.key
                ? "bg-sidebar-accent text-sidebar-foreground"
                : "text-muted-foreground hover:bg-sidebar-accent/40 hover:text-sidebar-foreground",
            )}
          >
            <button
              type="button"
              onClick={() => onSelect(view.key)}
              className="flex min-w-0 flex-1 items-center gap-1.5 px-3 py-2 text-left text-[11px] font-semibold tracking-[0.03em]"
              data-testid={`user-group-row-${view.key}`}
            >
              <span className="truncate">{view.label}</span>
            </button>
            <GroupRowTrailing
              count={countUserGroupItems(view)}
              canManage={Boolean(view.groupId)}
              hoverScope="row"
              groupId={view.groupId}
              groupName={view.label}
              renameLabel={t("rename")}
              deleteLabel={t("delete")}
              onRename={onRenameGroup}
              onDelete={async () => {
                if (!view.groupId) return;
                await onDeleteGroup(view.groupId);
              }}
            />
          </div>
        ),
      )}
    </div>
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-1 border-b border-sidebar-border px-2 py-1.5">
        <span className="px-1 text-[11px] font-semibold tracking-[0.03em] text-muted-foreground">
          Groups
        </span>
        <CreateGroupPopoverButton variant="icon" onCreate={onCreateGroup} />
      </div>
      <div className="scrollbar-on-hover flex-1 overflow-y-auto px-2 py-1.5">
        {canReorder ? (
          <DndContext
            collisionDetection={closestCenter}
            sensors={sensors}
            onDragEnd={handleDragEnd}
            modifiers={[restrictToVerticalAxis, restrictToWindowEdges]}
          >
            <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
              {list}
            </SortableContext>
          </DndContext>
        ) : (
          list
        )}
      </div>
    </div>
  );
}

export function UserGroupTwoColumnRightContent({
  selectedView,
  isPrimaryCollapsed,
  onTogglePrimaryPanel,
  projectItemProps,
  expandedProjectIds,
  onToggleProject,
  renderWorkspaceContentRow,
}: {
  selectedView: UserGroupView | null;
  isPrimaryCollapsed: boolean;
  onTogglePrimaryPanel: () => void;
  projectItemProps: ProjectItemSharedProps;
  expandedProjectIds: string[];
  onToggleProject: (projectId: string) => void;
  renderWorkspaceContentRow: (
    entry: FlattenedWorkspaceEntry,
    options?: { showProjectName?: boolean; rightContext?: React.ReactNode },
  ) => React.ReactNode;
}) {
  const t = useTranslations("appShell.groups");
  const chromeT = useTranslations("AppShell.chrome");
  const { activeProjectId, activeWorkspaceId, ...sharedProjectItemProps } =
    projectItemProps;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-sidebar-border">
        <div className="flex min-h-10 items-center gap-1 px-2">
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-sidebar-foreground">
              {selectedView?.label ?? chromeT("leftSidebarControls.selectGroup")}
            </div>
          </div>
          <TwoColumnSidebarToggleButton
            collapsed={isPrimaryCollapsed}
            onClick={onTogglePrimaryPanel}
          />
        </div>
      </div>
      <div className="scrollbar-on-hover flex-1 overflow-y-auto px-2 py-2">
        {!selectedView ? (
          <div className="px-3 py-6 text-sm text-muted-foreground">
            {chromeT("leftSidebarControls.selectGroupDescription")}
          </div>
        ) : countUserGroupItems(selectedView) === 0 ? (
          <div className="px-3 py-6 text-sm text-muted-foreground" data-testid="user-group-empty">
            {t("empty")}
          </div>
        ) : (
          <div className="space-y-2">
            {selectedView.projects.length > 0 ? (
              <div className="space-y-0.5">
                {selectedView.projects.map((project) => (
                  <ProjectItem
                    key={project.id}
                    project={project}
                    isExpanded={expandedProjectIds.includes(project.id)}
                    onToggle={() => onToggleProject(project.id)}
                    isActiveProject={
                      activeProjectId === project.id && !activeWorkspaceId
                    }
                    activeWorkspaceId={activeWorkspaceId}
                    {...sharedProjectItemProps}
                    workspaceSortingDisabled
                  />
                ))}
              </div>
            ) : null}
            {selectedView.directWorkspaces.length > 0 ? (
              <div className="space-y-1">
                <div className="px-2 pt-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/80">
                  {t("directWorkspaces")}
                </div>
                {selectedView.directWorkspaces.map((entry) =>
                  renderWorkspaceContentRow(entry, { showProjectName: true }),
                )}
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

function UserGroupHeaderPreview({
  label,
  isCollapsed,
  className,
}: {
  label: string;
  isCollapsed?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-1.5 rounded-md bg-sidebar-accent px-2 py-1.5 text-left text-[11px] font-semibold tracking-[0.03em] text-sidebar-foreground shadow-2xl",
        className,
      )}
    >
      {isCollapsed ? (
        <Folders className="size-3.5 shrink-0 text-muted-foreground" />
      ) : (
        <FolderOpen className="size-3.5 shrink-0 text-muted-foreground" />
      )}
      <span className="truncate">{label}</span>
    </div>
  );
}

function SortableUserGroupOneColumnSection({
  view,
  isCollapsed,
  isAnyGroupDragging,
  onToggleCollapsed,
  onRenameGroup,
  onDeleteGroup,
  projectItemProps,
  expandedProjectIds,
  onToggleProject,
  renderWorkspaceContentRow,
}: {
  view: UserGroupView;
  isCollapsed: boolean;
  isAnyGroupDragging: boolean;
  onToggleCollapsed: () => void;
  onRenameGroup: (groupId: string, name: string) => Promise<void> | void;
  onDeleteGroup: (groupId: string) => Promise<void> | void;
  projectItemProps: ProjectItemSharedProps;
  expandedProjectIds: string[];
  onToggleProject: (projectId: string) => void;
  renderWorkspaceContentRow: (
    entry: FlattenedWorkspaceEntry,
    options?: { showProjectName?: boolean; rightContext?: React.ReactNode },
  ) => React.ReactNode;
}) {
  const t = useTranslations("appShell.groups");
  const canSort = Boolean(view.groupId);
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: view.key, disabled: !canSort });
  const count = countUserGroupItems(view);
  const { activeProjectId, activeWorkspaceId, ...sharedProjectItemProps } =
    projectItemProps;
  // Match ProjectItem: hide nested list while any group is dragging.
  // DragOverlay follows the pointer, so collapsing source height is fine.
  const showChildren =
    !isCollapsed && !isDragging && !isAnyGroupDragging;

  return (
    <div
      ref={setNodeRef}
      style={{
        // DragOverlay follows the pointer; this node is the list placeholder.
        transform: CSS.Translate.toString(transform),
        transition: isDragging ? undefined : transition,
      }}
      className={cn(
        "group/group-section transition-all duration-200",
        // Match project drag: light placeholder while reordering.
        isDragging ? "relative z-20 opacity-20" : "opacity-100",
      )}
    >
      <div className="group/header flex items-center gap-0.5 rounded-lg px-1 py-0.5 hover:bg-sidebar-accent/40">
        {/*
          Project pattern: put useSortable attributes/listeners on a plain div
          (not CollapsibleTrigger/button). Click toggles collapse; drag uses the
          same host with activation distance from shared sidebar sensors.
        */}
        <div
          {...(canSort ? { ...attributes, ...listeners } : {})}
          className={cn(
            "flex min-w-0 flex-1 select-none items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-[11px] font-semibold tracking-[0.03em] text-muted-foreground hover:text-sidebar-foreground",
            "cursor-pointer",
          )}
          data-testid={`user-group-section-${view.key}`}
          onClick={() => {
            if (isAnyGroupDragging) return;
            onToggleCollapsed();
          }}
        >
          {showChildren ? (
            <FolderOpen className="size-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <Folders className="size-3.5 shrink-0 text-muted-foreground" />
          )}
          <span className="truncate">{view.label}</span>
          <ChevronRight
            className={cn(
              "ml-1 size-3 shrink-0 opacity-0 transition-all duration-200 group-hover/header:opacity-100",
              showChildren && "rotate-90",
            )}
          />
        </div>
        <GroupRowTrailing
          count={count}
          canManage={Boolean(view.groupId)}
          hoverScope="header"
          groupId={view.groupId}
          groupName={view.label}
          renameLabel={t("rename")}
          deleteLabel={t("delete")}
          onRename={onRenameGroup}
          onDelete={async () => {
            if (!view.groupId) return;
            await onDeleteGroup(view.groupId);
          }}
        />
      </div>

      {/* ProjectItem child-list pattern: grid collapse + opacity hide while dragging. */}
      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-300 ease-out",
          showChildren ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div
          className={cn(
            "overflow-hidden transition-opacity duration-300",
            isAnyGroupDragging || isDragging
              ? "invisible opacity-0"
              : "visible opacity-100",
          )}
        >
          <div
            className={cn(
              "space-y-1 pb-2 pl-1 transition-opacity duration-200",
              isAnyGroupDragging || isDragging
                ? "pointer-events-none opacity-0"
                : "opacity-100",
            )}
          >
            {count === 0 ? (
              <div className="px-3 py-2 text-[11px] text-muted-foreground">
                {view.key === UNGROUPED_USER_GROUP_KEY
                  ? t("emptyGroups")
                  : t("empty")}
              </div>
            ) : (
              <>
                {view.projects.map((project) => (
                  <ProjectItem
                    key={project.id}
                    project={project}
                    isExpanded={expandedProjectIds.includes(project.id)}
                    onToggle={() => onToggleProject(project.id)}
                    isActiveProject={
                      activeProjectId === project.id && !activeWorkspaceId
                    }
                    activeWorkspaceId={activeWorkspaceId}
                    {...sharedProjectItemProps}
                    // Nested workspaces must not register in the group DndContext.
                    workspaceSortingDisabled
                  />
                ))}
                {view.directWorkspaces.map((entry) =>
                  renderWorkspaceContentRow(entry, { showProjectName: true }),
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function UserGroupOneColumnContent({
  views,
  collapsedKeys,
  onToggleCollapsed,
  onCreateGroup,
  onRenameGroup,
  onDeleteGroup,
  projectItemProps,
  expandedProjectIds,
  onToggleProject,
  renderWorkspaceContentRow,
  sensors,
  onGroupOrderChange,
}: {
  views: UserGroupView[];
  collapsedKeys: Record<string, boolean>;
  onToggleCollapsed: (key: string) => void;
  onCreateGroup: (name: string) => Promise<unknown> | void;
  onRenameGroup: (groupId: string, name: string) => Promise<void> | void;
  onDeleteGroup: (groupId: string) => Promise<void> | void;
  projectItemProps: ProjectItemSharedProps;
  expandedProjectIds: string[];
  onToggleProject: (projectId: string) => void;
  renderWorkspaceContentRow: (
    entry: FlattenedWorkspaceEntry,
    options?: { showProjectName?: boolean; rightContext?: React.ReactNode },
  ) => React.ReactNode;
  sensors?: DndSensors;
  onGroupOrderChange?: (orderedGroupIds: string[]) => void | Promise<void>;
}) {
  const t = useTranslations("appShell.groups");
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const sortableIds = views
    .filter((view) => view.groupId)
    .map((view) => view.key);
  const sortableIdSet = new Set(sortableIds);
  // Only real groups count as "group dragging" — never workspace row ids.
  const isAnyGroupDragging =
    activeDragId !== null && sortableIdSet.has(activeDragId);
  const canReorder = Boolean(sensors && onGroupOrderChange && sortableIds.length > 1);

  const activeDragView = activeDragId
    ? views.find((view) => view.key === activeDragId) ?? null
    : null;

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    setActiveDragId(null);
    if (!canReorder || !over || active.id === over.id || !onGroupOrderChange) return;
    const oldIndex = sortableIds.indexOf(String(active.id));
    const newIndex = sortableIds.indexOf(String(over.id));
    if (oldIndex === -1 || newIndex === -1) return;
    void onGroupOrderChange(arrayMove(sortableIds, oldIndex, newIndex));
  };

  const sections = views.map((view) => {
    const stateKey = `group:${view.key}`;
    const isCollapsed = collapsedKeys[stateKey] ?? false;
    return (
      <SortableUserGroupOneColumnSection
        key={view.key}
        view={view}
        isCollapsed={isCollapsed}
        isAnyGroupDragging={isAnyGroupDragging}
        onToggleCollapsed={() => onToggleCollapsed(stateKey)}
        onRenameGroup={onRenameGroup}
        onDeleteGroup={onDeleteGroup}
        projectItemProps={projectItemProps}
        expandedProjectIds={expandedProjectIds}
        onToggleProject={onToggleProject}
        renderWorkspaceContentRow={renderWorkspaceContentRow}
      />
    );
  });

  return (
    <div className="scrollbar-on-hover flex h-full flex-col overflow-y-auto no-scrollbar">
      <div className="flex items-center justify-between px-3 py-1.5">
        <span className="text-[11px] font-semibold tracking-[0.03em] text-muted-foreground">
          Groups
        </span>
        <CreateGroupPopoverButton variant="labeled" onCreate={onCreateGroup} />
      </div>
      <div className="space-y-0.5 px-2 pb-2">
        {canReorder ? (
          <DndContext
            collisionDetection={(args) => {
              // Only collide with group rows — ignore any nested leftovers.
              const collisions = closestCenter(args);
              const groupOnly = collisions.filter((collision) =>
                sortableIdSet.has(String(collision.id)),
              );
              return groupOnly.length > 0 ? groupOnly : collisions;
            }}
            sensors={sensors}
            onDragStart={(event) => {
              const id = String(event.active.id);
              if (sortableIdSet.has(id)) {
                setActiveDragId(id);
              }
            }}
            onDragCancel={() => setActiveDragId(null)}
            onDragEnd={handleDragEnd}
            modifiers={[restrictToVerticalAxis, restrictToWindowEdges]}
          >
            <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
              {sections}
            </SortableContext>
            {/* Same as project list: overlay follows the pointer; source is a placeholder. */}
            <DragOverlay
              dropAnimation={{
                sideEffects: defaultDropAnimationSideEffects({
                  styles: {
                    active: {
                      opacity: "0.4",
                    },
                  },
                }),
              }}
            >
              {activeDragView ? (
                <UserGroupHeaderPreview
                  label={activeDragView.label}
                  isCollapsed={
                    collapsedKeys[`group:${activeDragView.key}`] ?? false
                  }
                  className="mx-1 min-w-[10rem]"
                />
              ) : null}
            </DragOverlay>
          </DndContext>
        ) : (
          sections
        )}
      </div>
    </div>
  );
}

export type { ProjectItemSharedProps };
