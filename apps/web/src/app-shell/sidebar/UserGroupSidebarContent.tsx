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
  onCreateGroup: () => void;
  onRenameGroup: (groupId: string, currentName: string) => void;
  onDeleteGroup: (groupId: string) => void;
}) {
  const t = useTranslations("appShell.groups");

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-1 border-b border-sidebar-border px-2 py-1.5">
        <span className="px-1 text-[11px] font-semibold tracking-[0.03em] text-muted-foreground">
          Groups
        </span>
        <button
          type="button"
          onClick={onCreateGroup}
          className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground"
          title={t("create")}
          data-testid="create-group-button"
        >
          <Plus className="size-3.5" />
        </button>
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
                  <span className="ml-auto text-[10px] font-medium normal-case tracking-normal text-muted-foreground/80">
                    {count}
                  </span>
                </button>
                {view.groupId ? (
                  <DropdownMenu modal={false}>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className="mr-1 inline-flex size-6 shrink-0 items-center justify-center rounded-md opacity-0 transition-opacity group-hover/row:opacity-100 hover:bg-sidebar-accent data-[popup-open]:opacity-100"
                        aria-label="Group actions"
                      >
                        <MoreHorizontal className="size-3.5" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-40">
                      <DropdownMenuItem
                        onClick={() =>
                          view.groupId && onRenameGroup(view.groupId, view.label)
                        }
                      >
                        <Pencil className="size-3.5" />
                        {t("rename")}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={() => view.groupId && onDeleteGroup(view.groupId)}
                      >
                        <Trash2 className="size-3.5" />
                        {t("delete")}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : null}
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
          <button
            type="button"
            onClick={onTogglePrimaryPanel}
            className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground"
            title={
              isPrimaryCollapsed
                ? chromeT("leftSidebarControls.expandFirstColumn")
                : chromeT("leftSidebarControls.collapseFirstColumn")
            }
          >
            <ChevronRight
              className={cn(
                "size-3.5 transition-transform",
                isPrimaryCollapsed ? "rotate-0" : "rotate-180",
              )}
            />
          </button>
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
  onCreateGroup: () => void;
  onRenameGroup: (groupId: string, currentName: string) => void;
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
        <button
          type="button"
          onClick={onCreateGroup}
          className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-[11px] text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground"
          data-testid="create-group-button"
        >
          <FolderPlus className="size-3.5" />
          {t("create")}
        </button>
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
                  <span className="ml-auto text-[10px] font-medium normal-case tracking-normal text-muted-foreground/80">
                    {count}
                  </span>
                </CollapsibleTrigger>
                {view.groupId ? (
                  <DropdownMenu modal={false}>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className="inline-flex size-6 shrink-0 items-center justify-center rounded-md opacity-0 transition-opacity group-hover/header:opacity-100 hover:bg-sidebar-accent data-[popup-open]:opacity-100"
                      >
                        <MoreHorizontal className="size-3.5" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-40">
                      <DropdownMenuItem
                        onClick={() =>
                          view.groupId && onRenameGroup(view.groupId, view.label)
                        }
                      >
                        <Pencil className="size-3.5" />
                        {t("rename")}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={() => view.groupId && onDeleteGroup(view.groupId)}
                      >
                        <Trash2 className="size-3.5" />
                        {t("delete")}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : null}
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

export function CreateOrRenameGroupDialog({
  open,
  mode,
  initialName,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  mode: "create" | "rename";
  initialName?: string;
  onOpenChange: (open: boolean) => void;
  onSubmit: (name: string) => Promise<void> | void;
}) {
  const t = useTranslations("appShell.groups");
  const [name, setName] = useState(initialName ?? "");
  const [busy, setBusy] = useState(false);

  React.useEffect(() => {
    if (open) {
      setName(initialName ?? "");
      setBusy(false);
    }
  }, [open, initialName]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    try {
      await onSubmit(trimmed);
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={() => !busy && onOpenChange(false)}
    >
      <form
        className="w-full max-w-sm rounded-xl border border-border bg-background p-4 shadow-xl"
        onClick={(event) => event.stopPropagation()}
        onSubmit={handleSubmit}
        data-testid="group-name-dialog"
      >
        <div className="mb-3 text-sm font-medium text-foreground">
          {mode === "create" ? t("create") : t("rename")}
        </div>
        <input
          autoFocus
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={t("createPlaceholder")}
          className="mb-3 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          data-testid="group-name-input"
        />
        <div className="flex justify-end gap-2">
          <button
            type="button"
            className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50"
            disabled={busy || !name.trim()}
            data-testid="group-name-submit"
          >
            {mode === "create" ? t("create") : t("rename")}
          </button>
        </div>
      </form>
    </div>
  );
}

export type { ProjectItemSharedProps };
