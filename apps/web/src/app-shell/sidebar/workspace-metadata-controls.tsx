"use client";

import React, { useState } from "react";
import { useTranslations } from "next-intl";
import {
  Badge,
  Button,
  Checkbox,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
  ColorPicker,
  isColorEyedropperActive,
  cn,
} from "@workspace/ui";
import { Tags, Pencil, UserPen, CircleDot, GitPullRequest, Folders, Plus } from "lucide-react";
import type {
  Group,
  WorkspaceLabel,
  WorkspacePriority,
  WorkspaceWorkflowStatus,
} from "@/shared/types/domain";
import { GroupNamePopoverForm } from "@/app-shell/sidebar/GroupNamePopoverForm";
import {
  getWorkspaceWorkflowStatusMeta,
  WORKSPACE_WORKFLOW_STATUS_OPTIONS,
} from "./workspace-status";
import { UNGROUPED_USER_GROUP_KEY } from "./user-groups";

type PopoverSide = "top" | "right" | "bottom" | "left";
type PopoverAlign = "start" | "center" | "end";

export const WORKSPACE_PRIORITY_OPTIONS: Array<{
  value: WorkspacePriority;
  labelKey: string;
  className: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { value: "no_priority", labelKey: "priority.noPriority", className: "text-muted-foreground", icon: PriorityNoneIcon },
  { value: "urgent", labelKey: "priority.urgent", className: "text-red-500/85", icon: PriorityUrgentIcon },
  { value: "high", labelKey: "priority.high", className: "text-orange-500", icon: PriorityBarsHighIcon },
  { value: "medium", labelKey: "priority.medium", className: "text-yellow-500", icon: PriorityBarsMediumIcon },
  { value: "low", labelKey: "priority.low", className: "text-emerald-500", icon: PriorityBarsLowIcon },
];

export const WORKSPACE_PRIORITY_SORT_WEIGHT: Record<WorkspacePriority, number> = {
  no_priority: 0,
  low: 1,
  medium: 2,
  high: 3,
  urgent: 4,
};

/** One row of common presets (fits the 280px color panel without wrapping). */
const LABEL_COLOR_SWATCHES = [
  "#6b7280", // Gray
  "#ef4444", // Red
  "#f97316", // Orange
  "#eab308", // Yellow
  "#22c55e", // Green
  "#3b82f6", // Blue
  "#a855f7", // Purple
];

function PriorityNoneIcon({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex size-4 flex-col items-center justify-center gap-[3px]", className)}>
      {[0, 1, 2].map((line) => (
        <span key={line} className="h-[1.5px] w-3 rounded-full bg-current" />
      ))}
    </span>
  );
}

function PriorityUrgentIcon({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex size-4 items-center justify-center rounded-[3px] bg-current", className)}>
      <span className="text-[11px] font-bold leading-none text-background">!</span>
    </span>
  );
}

function PriorityBarsIcon({ className, activeBars }: { className?: string; activeBars: number }) {
  return (
    <span className={cn("inline-flex h-4 w-4 items-end gap-[2px]", className)}>
      {[1, 2, 3].map((bar) => (
        <span
          key={bar}
          className={cn(
            "w-[3px] rounded-[1px] bg-current",
            bar === 1 && "h-1.5",
            bar === 2 && "h-2.5",
            bar === 3 && "h-3.5",
            bar > activeBars && "opacity-30",
          )}
        />
      ))}
    </span>
  );
}

function PriorityBarsHighIcon({ className }: { className?: string }) {
  return <PriorityBarsIcon className={className} activeBars={3} />;
}

function PriorityBarsMediumIcon({ className }: { className?: string }) {
  return <PriorityBarsIcon className={className} activeBars={2} />;
}

function PriorityBarsLowIcon({ className }: { className?: string }) {
  return <PriorityBarsIcon className={className} activeBars={1} />;
}

export function getWorkspacePriorityMeta(priority: WorkspacePriority) {
  return WORKSPACE_PRIORITY_OPTIONS.find((option) => option.value === priority) ?? WORKSPACE_PRIORITY_OPTIONS[0];
}

type MetadataSelectTriggerVariant = "chip" | "icon";

type WorkspacePrioritySelectProps = {
  value: WorkspacePriority;
  onChange?: (value: WorkspacePriority) => void;
  triggerVariant?: MetadataSelectTriggerVariant;
  contentSide?: PopoverSide;
  contentAlign?: PopoverAlign;
  contentClassName?: string;
  triggerClassName?: string;
  iconClassName?: string;
  labelClassName?: string;
  showLabel?: boolean;
  disabled?: boolean;
  title?: string;
  surface?: boolean;
  onOpenChange?: (open: boolean) => void;
};

export function WorkspacePrioritySelect({
  value,
  onChange,
  triggerVariant = "chip",
  contentSide = "right",
  contentAlign = "start",
  contentClassName,
  triggerClassName,
  iconClassName,
  labelClassName,
  showLabel = triggerVariant !== "icon",
  disabled,
  title,
  surface,
  onOpenChange,
}: WorkspacePrioritySelectProps) {
  const t = useTranslations("appShell.task");
  const meta = getWorkspacePriorityMeta(value);
  const Icon = meta.icon;
  const isDisabled = disabled || !onChange;
  const resolvedTitle = title ?? t("priority.trigger");
  const trigger = (
    <button
      type="button"
      disabled={isDisabled}
      title={resolvedTitle}
      className={cn(
        triggerVariant === "icon"
          ? "inline-flex size-8 items-center justify-center rounded-md text-foreground transition-colors hover:bg-muted"
          : "inline-flex h-6 items-center gap-1.5 rounded-md border border-border/60 bg-muted/35 px-2 text-xs text-foreground",
        !isDisabled && triggerVariant !== "icon" && "cursor-pointer transition-colors hover:bg-muted",
        triggerClassName,
      )}
    >
      <Icon className={cn("shrink-0", triggerVariant === "icon" ? "size-4" : "size-4", meta.className, iconClassName)} />
      {showLabel ? <span className={cn("font-medium", labelClassName)}>{t(meta.labelKey)}</span> : null}
    </button>
  );

  if (!onChange) return trigger;

  return (
    <DropdownMenu modal={false} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent
        data-workspace-popover-surface={surface ? "true" : undefined}
        side={contentSide}
        align={contentAlign}
        className={cn("w-40", contentClassName)}
      >
        <DropdownMenuRadioGroup value={value} onValueChange={(nextValue) => onChange(nextValue as WorkspacePriority)}>
          {WORKSPACE_PRIORITY_OPTIONS.map((option) => {
            const OptionIcon = option.icon;
            return (
              <DropdownMenuRadioItem
                key={option.value}
                value={option.value}
                className="cursor-pointer pl-2 data-[state=checked]:bg-accent data-[state=checked]:text-accent-foreground [&>span:first-child]:hidden"
              >
                <OptionIcon className={cn("shrink-0", option.className)} />
                <span className="font-medium">{t(option.labelKey)}</span>
              </DropdownMenuRadioItem>
            );
          })}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

type WorkspaceStatusSelectProps = {
  value: WorkspaceWorkflowStatus;
  onChange?: (value: WorkspaceWorkflowStatus) => void;
  triggerVariant?: MetadataSelectTriggerVariant;
  contentSide?: PopoverSide;
  contentAlign?: PopoverAlign;
  contentClassName?: string;
  triggerClassName?: string;
  iconClassName?: string;
  labelClassName?: string;
  showLabel?: boolean;
  disabled?: boolean;
  title?: string;
  surface?: boolean;
  onOpenChange?: (open: boolean) => void;
};

export function WorkspaceStatusSelect({
  value,
  onChange,
  triggerVariant = "chip",
  contentSide = "right",
  contentAlign = "start",
  contentClassName,
  triggerClassName,
  iconClassName,
  labelClassName,
  showLabel = triggerVariant !== "icon",
  disabled,
  title,
  surface,
  onOpenChange,
}: WorkspaceStatusSelectProps) {
  const t = useTranslations("appShell.task");
  const meta = getWorkspaceWorkflowStatusMeta(value);
  const Icon = meta.icon;
  const isDisabled = disabled || !onChange;
  const resolvedTitle = title ?? t("status.trigger");
  const trigger = (
    <button
      type="button"
      disabled={isDisabled}
      title={resolvedTitle}
      className={cn(
        triggerVariant === "icon"
          ? "inline-flex size-8 items-center justify-center rounded-md text-foreground transition-colors hover:bg-muted"
          : "inline-flex h-6 items-center gap-1.5 rounded-md border border-border/60 bg-muted/35 px-2 text-xs text-foreground",
        !isDisabled && triggerVariant !== "icon" && "cursor-pointer transition-colors hover:bg-muted",
        triggerClassName,
      )}
    >
      <Icon className={cn("size-3.5 shrink-0", meta.className, iconClassName)} />
      {showLabel ? <span className={cn(labelClassName)}>{t(meta.labelKey)}</span> : null}
    </button>
  );

  if (!onChange) return trigger;

  return (
    <DropdownMenu modal={false} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent
        data-workspace-popover-surface={surface ? "true" : undefined}
        side={contentSide}
        align={contentAlign}
        className={cn("w-40", contentClassName)}
      >
        <DropdownMenuRadioGroup value={value} onValueChange={(nextValue) => onChange(nextValue as WorkspaceWorkflowStatus)}>
          {WORKSPACE_WORKFLOW_STATUS_OPTIONS.map((option) => {
            const OptionIcon = option.icon;
            return (
              <DropdownMenuRadioItem
                key={option.value}
                value={option.value}
                className="cursor-pointer pl-2 data-[state=checked]:bg-accent data-[state=checked]:text-accent-foreground [&>span:first-child]:hidden"
              >
                <OptionIcon className={cn("size-4", option.className)} />
                <span>{t(option.labelKey)}</span>
              </DropdownMenuRadioItem>
            );
          })}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

type WorkspaceGroupSelectProps = {
  /** Current group id, or null / undefined when ungrouped. */
  value: string | null;
  groups: Group[];
  onChange?: (groupId: string | null) => void;
  /**
   * Create a group by name. When it resolves to `{ id }`, the workspace is
   * assigned to that new group (same flow as Project ··· → New Group).
   */
  onCreateGroup?: (name: string) => Promise<{ id: string } | void> | { id: string } | void;
  triggerVariant?: MetadataSelectTriggerVariant;
  contentSide?: PopoverSide;
  contentAlign?: PopoverAlign;
  contentClassName?: string;
  triggerClassName?: string;
  iconClassName?: string;
  labelClassName?: string;
  showLabel?: boolean;
  disabled?: boolean;
  title?: string;
  surface?: boolean;
  onOpenChange?: (open: boolean) => void;
};

export function WorkspaceGroupSelect({
  value,
  groups,
  onChange,
  onCreateGroup,
  triggerVariant = "chip",
  contentSide = "right",
  contentAlign = "start",
  contentClassName,
  triggerClassName,
  iconClassName,
  labelClassName,
  showLabel = triggerVariant !== "icon",
  disabled,
  title,
  surface,
  onOpenChange,
}: WorkspaceGroupSelectProps) {
  const t = useTranslations("appShell.groups");
  const [menuOpen, setMenuOpen] = useState(false);
  const selectedGroup = value
    ? groups.find((group) => group.id === value) ?? null
    : null;
  const label = selectedGroup?.name ?? t("ungrouped");
  const isDisabled = disabled || !onChange;
  const resolvedTitle = title ?? t("trigger");
  const radioValue = value ?? UNGROUPED_USER_GROUP_KEY;

  const handleOpenChange = (open: boolean) => {
    setMenuOpen(open);
    onOpenChange?.(open);
  };

  const trigger = (
    <button
      type="button"
      disabled={isDisabled}
      title={resolvedTitle}
      className={cn(
        triggerVariant === "icon"
          ? "inline-flex size-8 items-center justify-center rounded-md text-foreground transition-colors hover:bg-muted"
          : "inline-flex h-6 max-w-[9.5rem] items-center gap-1.5 rounded-md border border-border/60 bg-muted/35 px-2 text-xs text-foreground",
        !isDisabled && triggerVariant !== "icon" && "cursor-pointer transition-colors hover:bg-muted",
        triggerClassName,
      )}
      data-testid="workspace-group-select"
    >
      <Folders
        className={cn(
          "shrink-0 text-muted-foreground",
          triggerVariant === "icon" ? "size-4" : "size-3.5",
          iconClassName,
        )}
      />
      {showLabel ? (
        <span className={cn("truncate font-medium", labelClassName)}>{label}</span>
      ) : null}
    </button>
  );

  if (!onChange) return trigger;

  return (
    <DropdownMenu modal={false} open={menuOpen} onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent
        data-workspace-popover-surface={surface ? "true" : undefined}
        side={contentSide}
        align={contentAlign}
        className={cn("w-max min-w-[11rem]", contentClassName)}
      >
        <DropdownMenuRadioGroup
          value={radioValue}
          onValueChange={(nextValue) => {
            if (nextValue === UNGROUPED_USER_GROUP_KEY) {
              onChange(null);
              return;
            }
            onChange(nextValue);
          }}
        >
          <DropdownMenuRadioItem
            value={UNGROUPED_USER_GROUP_KEY}
            className="cursor-pointer pl-2 data-[state=checked]:bg-accent data-[state=checked]:text-accent-foreground [&>span:first-child]:hidden"
          >
            <Folders className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="font-medium">{t("ungrouped")}</span>
          </DropdownMenuRadioItem>
          {groups.map((group) => (
            <DropdownMenuRadioItem
              key={group.id}
              value={group.id}
              className="cursor-pointer pl-2 data-[state=checked]:bg-accent data-[state=checked]:text-accent-foreground [&>span:first-child]:hidden"
            >
              <Folders className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate font-medium">{group.name}</span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        {onCreateGroup ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger className="cursor-pointer">
                <Plus className="size-3.5" />
                <span>{t("create")}</span>
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent
                className="w-56 p-2"
                onKeyDown={(event) => event.stopPropagation()}
                onClick={(event) => event.stopPropagation()}
              >
                <GroupNamePopoverForm
                  mode="create"
                  onCancel={() => handleOpenChange(false)}
                  onSubmit={async (name) => {
                    const created = await onCreateGroup(name);
                    if (created?.id) {
                      onChange(created.id);
                    }
                    handleOpenChange(false);
                  }}
                />
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

type WorkspaceLabelPickerProps = {
  labels: WorkspaceLabel[];
  availableLabels: WorkspaceLabel[];
  onChange?: (labels: WorkspaceLabel[]) => void | Promise<void>;
  onCreateLabel?: (data: { name: string; color: string }) => Promise<WorkspaceLabel>;
  onUpdateLabel?: (labelId: string, data: { name: string; color: string }) => Promise<WorkspaceLabel>;
  triggerVariant?: "add" | "summary" | "icon";
  contentSide?: PopoverSide;
  contentAlign?: PopoverAlign;
  editorSide?: PopoverSide;
  contentClassName?: string;
  triggerClassName?: string;
  surface?: boolean;
  onOpenChange?: (open: boolean) => void;
};

export function WorkspaceLabelPicker({
  labels,
  availableLabels,
  onChange,
  onCreateLabel,
  onUpdateLabel,
  triggerVariant = "add",
  contentSide = "right",
  contentAlign = "start",
  editorSide = "right",
  contentClassName,
  triggerClassName,
  surface,
  onOpenChange,
}: WorkspaceLabelPickerProps) {
  const t = useTranslations("appShell.task");
  const [isOpen, setIsOpen] = React.useState(false);
  const [labelEditorKey, setLabelEditorKey] = React.useState<string | null>(null);
  const [editingLabel, setEditingLabel] = React.useState<WorkspaceLabel | null>(null);
  const [labelSearchQuery, setLabelSearchQuery] = React.useState("");
  const [newLabelName, setNewLabelName] = React.useState("");
  const [newLabelColor, setNewLabelColor] = React.useState("#3b82f6");

  const selectedLabelIds = React.useMemo(() => new Set(labels.map((label) => label.id)), [labels]);
  const filteredAvailableLabels = React.useMemo(() => {
    const query = labelSearchQuery.trim().toLowerCase();
    if (!query) return availableLabels;
    return availableLabels.filter((label) => label.name.toLowerCase().includes(query));
  }, [availableLabels, labelSearchQuery]);

  const resetEditor = React.useCallback(() => {
    setLabelEditorKey(null);
    setEditingLabel(null);
    setLabelSearchQuery("");
    setNewLabelName("");
  }, []);

  const setOpen = React.useCallback((open: boolean) => {
    // Stay open while EyeDropper is sampling colors outside the popover.
    if (!open && isColorEyedropperActive()) return;
    setIsOpen(open);
    onOpenChange?.(open);
    if (!open) resetEditor();
  }, [onOpenChange, resetEditor]);

  const openLabelEditor = React.useCallback((label: WorkspaceLabel | null) => {
    setEditingLabel(label);
    setNewLabelName(label?.name ?? "");
    setNewLabelColor(label?.color ?? "#3b82f6");
    setLabelEditorKey(label?.id ?? "new");
  }, []);

  const handleToggleLabel = React.useCallback((label: WorkspaceLabel) => {
    if (!onChange) return;
    const nextLabels = selectedLabelIds.has(label.id)
      ? labels.filter((existing) => existing.id !== label.id)
      : [...labels, label];
    void onChange(nextLabels);
  }, [labels, onChange, selectedLabelIds]);

  const handleCreateLabel = React.useCallback(async () => {
    const name = newLabelName.trim();
    if (!name || !onCreateLabel || !onChange) return;
    const color = newLabelColor;
    if (editingLabel && onUpdateLabel) {
      const label = await onUpdateLabel(editingLabel.id, { name, color });
      if (selectedLabelIds.has(label.id)) {
        await onChange(labels.map((existing) => existing.id === label.id ? label : existing));
      }
    } else {
      const label = await onCreateLabel({ name, color });
      const nextLabels = selectedLabelIds.has(label.id) ? labels : [...labels, label];
      await onChange(nextLabels);
    }
    setNewLabelName("");
    setLabelEditorKey(null);
    setEditingLabel(null);
  }, [editingLabel, labels, newLabelColor, newLabelName, onChange, onCreateLabel, onUpdateLabel, selectedLabelIds]);

  const trigger = (
    <button
      type="button"
      disabled={!onChange}
      title={t("labels.trigger")}
      className={cn(
        triggerVariant === "icon"
          ? "relative inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          : triggerVariant === "summary"
            ? "inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-background px-2 py-1 text-xs transition-colors hover:bg-muted"
            : "inline-flex h-6 items-center rounded-full bg-foreground/12 px-2 text-xs font-medium text-foreground transition-colors hover:bg-foreground/18",
        triggerClassName,
      )}
    >
      {triggerVariant === "add" ? (
        t("labels.addButton")
      ) : (
        <>
          <Tags className="size-3.5 shrink-0" />
          {triggerVariant === "summary" ? (
            <span className="text-xs text-muted-foreground">
              {labels.length > 0
                ? t("labels.summary.selected", { count: labels.length })
                : t("labels.summary.empty")}
            </span>
          ) : null}
          {triggerVariant === "icon" && labels.length > 0 ? (
            <span className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-primary" />
          ) : null}
        </>
      )}
    </button>
  );

  if (!onChange) return trigger;

  return (
    <Popover open={isOpen} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        data-workspace-popover-surface={surface ? "true" : undefined}
        side={contentSide}
        align={contentAlign}
        className={cn("w-64 space-y-3 p-3", contentClassName)}
      >
        {onCreateLabel ? (
          <Popover
            open={labelEditorKey === "new"}
            onOpenChange={(open) => {
              if (!open && isColorEyedropperActive()) return;
              if (open) {
                openLabelEditor(null);
              } else if (labelEditorKey === "new") {
                setLabelEditorKey(null);
                setEditingLabel(null);
              }
            }}
          >
            <PopoverTrigger asChild>
              <button
                type="button"
                className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs font-medium text-foreground transition-colors hover:bg-muted"
              >
                <span>{t("labels.createNew")}</span>
                <span className="text-muted-foreground">+</span>
              </button>
            </PopoverTrigger>
            <LabelEditorContent
              side={editorSide}
              surface={surface}
              newLabelName={newLabelName}
              newLabelColor={newLabelColor}
              editingLabel={editingLabel}
              setNewLabelName={setNewLabelName}
              setNewLabelColor={setNewLabelColor}
              onSubmit={handleCreateLabel}
            />
          </Popover>
        ) : null}
        <Input
          value={labelSearchQuery}
          onChange={(event) => setLabelSearchQuery(event.target.value)}
          placeholder={t("labels.searchPlaceholder")}
          className="h-7 text-xs"
        />
        <div className="max-h-64 space-y-1 overflow-y-auto">
          {availableLabels.length === 0 ? (
            <div className="py-2 text-center text-xs text-muted-foreground">{t("labels.empty")}</div>
          ) : filteredAvailableLabels.length === 0 ? (
            <div className="py-2 text-center text-xs text-muted-foreground">{t("labels.noMatch")}</div>
          ) : filteredAvailableLabels.map((label) => {
            const SourceIcon = label.source === 'manual' ? UserPen : label.source === 'gitHub_issue' ? CircleDot : GitPullRequest;
            return (
              <div key={label.id} className="group/label-item relative">
                <div
                  role="button"
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      handleToggleLabel(label);
                    }
                  }}
                  onClick={() => handleToggleLabel(label)}
                  className={cn(
                    "flex h-8 w-full cursor-pointer items-center gap-2 rounded-md px-2 text-left text-xs transition-colors hover:bg-muted",
                    selectedLabelIds.has(label.id) && "bg-muted",
                  )}
                >
                  <Checkbox
                    checked={selectedLabelIds.has(label.id)}
                    tabIndex={-1}
                    className="pointer-events-none size-3.5"
                  />
                  <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: label.color }} />
                  <span className="min-w-0 truncate flex-1">{label.name}</span>
                  {onUpdateLabel ? (
                    <Popover
                      open={labelEditorKey === label.id}
                      onOpenChange={(open) => {
                        if (!open && isColorEyedropperActive()) return;
                        if (open) {
                          openLabelEditor(label);
                        } else if (labelEditorKey === label.id) {
                          setLabelEditorKey(null);
                          setEditingLabel(null);
                        }
                      }}
                    >
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            openLabelEditor(label);
                          }}
                          className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        >
                          <SourceIcon className="size-3 group-hover/label-item:hidden" />
                          <Pencil className="size-3 hidden group-hover/label-item:block" />
                        </button>
                      </PopoverTrigger>
                      <LabelEditorContent
                        side={editorSide}
                        surface={surface}
                        newLabelName={newLabelName}
                        newLabelColor={newLabelColor}
                        editingLabel={editingLabel}
                        setNewLabelName={setNewLabelName}
                        setNewLabelColor={setNewLabelColor}
                        onSubmit={handleCreateLabel}
                      />
                    </Popover>
                  ) : (
                    <SourceIcon className="size-3 shrink-0 text-muted-foreground" />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function LabelEditorContent({
  side,
  surface,
  newLabelName,
  newLabelColor,
  editingLabel,
  setNewLabelName,
  setNewLabelColor,
  onSubmit,
  popoverContentProps,
}: {
  side: PopoverSide;
  surface?: boolean;
  newLabelName: string;
  newLabelColor: string;
  editingLabel: WorkspaceLabel | null;
  setNewLabelName: (value: string) => void;
  setNewLabelColor: (value: string) => void;
  onSubmit: () => void;
  popoverContentProps?: React.ComponentPropsWithoutRef<typeof PopoverContent>;
}) {
  const t = useTranslations("appShell.task");
  // Keep the editor popover open while the native EyeDropper is sampling.
  const isColorEyedroppingRef = React.useRef(false);
  const {
    onInteractOutside: consumerInteractOutside,
    onPointerDownOutside: consumerPointerDownOutside,
    onFocusOutside: consumerFocusOutside,
    ...restPopoverContentProps
  } = popoverContentProps ?? {};

  const guardDismiss = React.useCallback(
    (
      event: Event,
      consumer?: (event: Event) => void,
    ) => {
      if (isColorEyedroppingRef.current || isColorEyedropperActive()) {
        event.preventDefault();
        return;
      }
      consumer?.(event);
    },
    [],
  );

  return (
    <PopoverContent
      data-workspace-popover-surface={surface ? "true" : undefined}
      side={side}
      align="start"
      sideOffset={8}
      alignOffset={28}
      avoidCollisions
      className="w-auto space-y-2 border-0 bg-transparent p-0 shadow-none"
      onInteractOutside={(event) => guardDismiss(event, consumerInteractOutside as ((e: Event) => void) | undefined)}
      onPointerDownOutside={(event) => guardDismiss(event, consumerPointerDownOutside as ((e: Event) => void) | undefined)}
      onFocusOutside={(event) => guardDismiss(event, consumerFocusOutside as ((e: Event) => void) | undefined)}
      {...restPopoverContentProps}
    >
      <div className="space-y-2 rounded-xl border border-border/60 bg-popover p-3 shadow-md">
        <div className="flex items-center gap-2">
          <Input
            value={newLabelName}
            onChange={(event) => setNewLabelName(event.target.value)}
            placeholder={editingLabel ? t("labelEditor.editPlaceholder") : t("labelEditor.createPlaceholder")}
            className="h-7 flex-1 text-xs"
            autoFocus
          />
          <Button
            size="sm"
            className="h-7 px-2 text-xs"
            disabled={!newLabelName.trim()}
            onClick={() => onSubmit()}
          >
            {editingLabel ? t("labelEditor.save") : t("labelEditor.add")}
          </Button>
        </div>
        <ColorPicker
          value={newLabelColor}
          onValueChange={(value) => {
            setNewLabelColor(value);
          }}
          onEyedropperOpenChange={(active) => {
            isColorEyedroppingRef.current = active;
          }}
          swatches={LABEL_COLOR_SWATCHES}
        />
      </div>
    </PopoverContent>
  );
}

export function WorkspaceLabelBadges({ labels, className }: { labels: WorkspaceLabel[]; className?: string }) {
  if (labels.length === 0) return null;

  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {labels.map((label) => (
        <Badge
          key={label.id}
          variant="outline"
          className="gap-1.5 rounded-full border-dashed border-border bg-muted/60 text-xs text-foreground"
        >
          <span className="size-1.5 rounded-full" style={{ backgroundColor: label.color }} aria-hidden="true" />
          {label.name}
        </Badge>
      ))}
    </div>
  );
}

export function WorkspaceLabelDots({
  labels,
  max = 4,
  className,
  overlap = false,
}: {
  labels: WorkspaceLabel[];
  max?: number;
  className?: string;
  overlap?: boolean;
}) {
  if (labels.length === 0) return null;

  return (
    <div className={cn("flex items-center", !overlap && "gap-1", className)}>
      {labels.slice(0, max).map((label, index) => (
        <span
          key={label.id}
          className={cn("size-2.5 rounded-full", overlap && index > 0 && "-ml-[3px]")}
          style={{ backgroundColor: label.color, zIndex: index + 1 }}
          title={label.name}
        />
      ))}
      {labels.length > max ? (
        <span className={cn("text-[10px] text-muted-foreground", overlap && "ml-1")}>+{labels.length - max}</span>
      ) : null}
    </div>
  );
}
