"use client";

import React, { useState } from "react";
import { useTranslations } from "next-intl";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input,
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverTrigger,
  cn,
} from "@workspace/ui";
import {
  ChevronRight,
  FolderPlus,
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
import { ProjectItem, type ProjectItemProps } from "@/app-shell/sidebar/ProjectItem";
import { TwoColumnSidebarToggleButton } from "@/app-shell/left-sidebar-controls";

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
>;

function GroupNamePopoverForm({
  mode,
  initialName = "",
  onSubmit,
  onCancel,
}: {
  mode: "create" | "rename";
  initialName?: string;
  onSubmit: (name: string) => Promise<void> | void;
  onCancel: () => void;
}) {
  const t = useTranslations("appShell.groups");
  const [name, setName] = useState(initialName);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    try {
      await onSubmit(trimmed);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="space-y-2"
      onSubmit={(event) => {
        void handleSubmit(event);
      }}
      data-testid="group-name-popover"
    >
      <div className="text-xs font-medium text-foreground">
        {mode === "create" ? t("create") : t("rename")}
      </div>
      <Input
        autoFocus
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder={t("createPlaceholder")}
        className="h-8 text-sm"
        data-testid="group-name-input"
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            onCancel();
          }
        }}
      />
      <div className="flex justify-end gap-1.5">
        <button
          type="button"
          className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
          onClick={onCancel}
          disabled={busy}
        >
          Cancel
        </button>
        <button
          type="submit"
          className="rounded-md bg-primary px-2 py-1 text-xs text-primary-foreground disabled:opacity-50"
          disabled={busy || !name.trim()}
          data-testid="group-name-submit"
        >
          {mode === "create" ? t("create") : t("rename")}
        </button>
      </div>
    </form>
  );
}

function CreateGroupPopoverButton({
  variant,
  onCreate,
}: {
  variant: "icon" | "labeled";
  onCreate: (name: string) => Promise<void> | void;
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
  onDelete: () => void;
  renameLabel: string;
  deleteLabel: string;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const countHideOnHover =
    hoverScope === "row" ? "group-hover/row:opacity-0" : "group-hover/header:opacity-0";
  const buttonShowOnHover =
    hoverScope === "row" ? "group-hover/row:opacity-100" : "group-hover/header:opacity-100";
  const trailingActive = menuOpen || renameOpen;

  return (
    <div className="relative mr-1 flex size-6 shrink-0 items-center justify-center">
      <span
        className={cn(
          "text-[10px] font-medium normal-case tracking-normal text-muted-foreground/80 transition-opacity",
          canManage && (trailingActive ? "opacity-0" : countHideOnHover),
        )}
      >
        {count}
      </span>
      {canManage && groupId ? (
        <Popover
          open={renameOpen}
          onOpenChange={(open) => {
            setRenameOpen(open);
            if (open) setMenuOpen(false);
          }}
        >
          <PopoverAnchor asChild>
            <div className="absolute inset-0">
              <DropdownMenu modal={false} open={menuOpen} onOpenChange={setMenuOpen}>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className={cn(
                      "absolute inset-0 z-10 inline-flex items-center justify-center rounded-md text-muted-foreground transition-opacity hover:bg-sidebar-accent hover:text-sidebar-foreground",
                      trailingActive ? "opacity-100" : cn("opacity-0", buttonShowOnHover),
                    )}
                    aria-label="Group actions"
                  >
                    <MoreHorizontal className="size-3.5" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-40">
                  <DropdownMenuItem
                    onSelect={(event) => {
                      event.preventDefault();
                      setMenuOpen(false);
                      // Open rename popover next to the ··· control.
                      queueMicrotask(() => setRenameOpen(true));
                    }}
                  >
                    <Pencil className="size-3.5" />
                    {renameLabel}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onClick={onDelete}>
                    <Trash2 className="size-3.5" />
                    {deleteLabel}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </PopoverAnchor>
          <PopoverContent
            side="right"
            align="start"
            sideOffset={8}
            className="w-56 p-2"
            onOpenAutoFocus={(event) => event.preventDefault()}
          >
            <GroupNamePopoverForm
              key={`${groupId}:${groupName}:${renameOpen ? "open" : "closed"}`}
              mode="rename"
              initialName={groupName}
              onCancel={() => setRenameOpen(false)}
              onSubmit={async (name) => {
                await onRename(groupId, name);
                setRenameOpen(false);
              }}
            />
          </PopoverContent>
        </Popover>
      ) : null}
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
}: {
  views: UserGroupView[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
  onCreateGroup: (name: string) => Promise<void> | void;
  onRenameGroup: (groupId: string, name: string) => Promise<void> | void;
  onDeleteGroup: (groupId: string) => void;
}) {
  const t = useTranslations("appShell.groups");

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-1 border-b border-sidebar-border px-2 py-1.5">
        <span className="px-1 text-[11px] font-semibold tracking-[0.03em] text-muted-foreground">
          Groups
        </span>
        <CreateGroupPopoverButton variant="icon" onCreate={onCreateGroup} />
      </div>
      <div className="scrollbar-on-hover flex-1 overflow-y-auto px-2 py-1.5">
        <div className="space-y-1">
          {views.map((view) => {
            const isSelected = selectedKey === view.key;
            const count = countUserGroupItems(view);
            return (
              <div
                key={view.key}
                className={cn(
                  "group/row flex w-full items-center gap-0.5 rounded-lg transition-colors",
                  isSelected
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
                  count={count}
                  canManage={Boolean(view.groupId)}
                  hoverScope="row"
                  groupId={view.groupId}
                  groupName={view.label}
                  renameLabel={t("rename")}
                  deleteLabel={t("delete")}
                  onRename={onRenameGroup}
                  onDelete={() => view.groupId && onDeleteGroup(view.groupId)}
                />
              </div>
            );
          })}
        </div>
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
                    {...projectItemProps}
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
}: {
  views: UserGroupView[];
  collapsedKeys: Record<string, boolean>;
  onToggleCollapsed: (key: string) => void;
  onCreateGroup: (name: string) => Promise<void> | void;
  onRenameGroup: (groupId: string, name: string) => Promise<void> | void;
  onDeleteGroup: (groupId: string) => void;
  projectItemProps: ProjectItemSharedProps;
  expandedProjectIds: string[];
  onToggleProject: (projectId: string) => void;
  renderWorkspaceContentRow: (
    entry: FlattenedWorkspaceEntry,
    options?: { showProjectName?: boolean; rightContext?: React.ReactNode },
  ) => React.ReactNode;
}) {
  const t = useTranslations("appShell.groups");

  return (
    <div className="scrollbar-on-hover flex h-full flex-col overflow-y-auto no-scrollbar">
      <div className="flex items-center justify-between px-3 py-1.5">
        <span className="text-[11px] font-semibold tracking-[0.03em] text-muted-foreground">
          Groups
        </span>
        <CreateGroupPopoverButton variant="labeled" onCreate={onCreateGroup} />
      </div>
      <div className="space-y-0.5 px-2 pb-2">
        {views.map((view) => {
          const stateKey = `group:${view.key}`;
          const isCollapsed = collapsedKeys[stateKey] ?? false;
          const count = countUserGroupItems(view);
          return (
            <Collapsible
              key={view.key}
              open={!isCollapsed}
              onOpenChange={() => onToggleCollapsed(stateKey)}
            >
              <div className="group/header flex items-center gap-0.5 rounded-lg px-1 py-0.5 hover:bg-sidebar-accent/40">
                <CollapsibleTrigger className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-[11px] font-semibold tracking-[0.03em] text-muted-foreground hover:text-sidebar-foreground">
                  <ChevronRight
                    className={cn(
                      "size-3.5 shrink-0 transition-transform",
                      !isCollapsed && "rotate-90",
                    )}
                  />
                  <span className="truncate">{view.label}</span>
                </CollapsibleTrigger>
                <GroupRowTrailing
                  count={count}
                  canManage={Boolean(view.groupId)}
                  hoverScope="header"
                  groupId={view.groupId}
                  groupName={view.label}
                  renameLabel={t("rename")}
                  deleteLabel={t("delete")}
                  onRename={onRenameGroup}
                  onDelete={() => view.groupId && onDeleteGroup(view.groupId)}
                />
              </div>
              <CollapsibleContent>
                <div className="space-y-1 pb-2 pl-1">
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
                          {...projectItemProps}
                        />
                      ))}
                      {view.directWorkspaces.map((entry) =>
                        renderWorkspaceContentRow(entry, { showProjectName: true }),
                      )}
                    </>
                  )}
                </div>
              </CollapsibleContent>
            </Collapsible>
          );
        })}
      </div>
    </div>
  );
}

export type { ProjectItemSharedProps };
