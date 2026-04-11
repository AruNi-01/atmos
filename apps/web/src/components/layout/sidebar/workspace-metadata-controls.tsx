"use client";

import React from "react";
import {
  Badge,
  Button,
  Checkbox,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
  cn,
} from "@workspace/ui";
import { Tags, Pencil } from "lucide-react";
import { useTheme } from "next-themes";
import { SketchPicker } from "react-color";
import type { WorkspaceLabel, WorkspacePriority, WorkspaceWorkflowStatus } from "@/types/types";
import { PROJECT_COLOR_PRESETS } from "@/types/types";
import {
  getWorkspaceWorkflowStatusMeta,
  WORKSPACE_WORKFLOW_STATUS_OPTIONS,
} from "./workspace-status";

type PopoverSide = "top" | "right" | "bottom" | "left";
type PopoverAlign = "start" | "center" | "end";

export const WORKSPACE_PRIORITY_OPTIONS: Array<{
  value: WorkspacePriority;
  label: string;
  className: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { value: "no_priority", label: "No priority", className: "text-muted-foreground", icon: PriorityNoneIcon },
  { value: "urgent", label: "Urgent", className: "text-red-500/85", icon: PriorityUrgentIcon },
  { value: "high", label: "High", className: "text-orange-500", icon: PriorityBarsHighIcon },
  { value: "medium", label: "Medium", className: "text-yellow-500", icon: PriorityBarsMediumIcon },
  { value: "low", label: "Low", className: "text-emerald-500", icon: PriorityBarsLowIcon },
];

export const WORKSPACE_PRIORITY_SORT_WEIGHT: Record<WorkspacePriority, number> = {
  no_priority: 0,
  low: 1,
  medium: 2,
  high: 3,
  urgent: 4,
};

const LABEL_COLOR_PRESETS = [...PROJECT_COLOR_PRESETS, { name: "Cyan", color: "#06b6d4" }];

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

function parseHexColor(color: string) {
  const hex = color.replace("#", "");
  return {
    r: parseInt(hex.slice(0, 2), 16),
    g: parseInt(hex.slice(2, 4), 16),
    b: parseInt(hex.slice(4, 6), 16),
  };
}

function parseColorToRgb(color: string): { r: number; g: number; b: number; a: number } {
  const rgbaMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
  if (rgbaMatch) {
    return {
      r: parseInt(rgbaMatch[1], 10),
      g: parseInt(rgbaMatch[2], 10),
      b: parseInt(rgbaMatch[3], 10),
      a: rgbaMatch[4] ? parseFloat(rgbaMatch[4]) : 1,
    };
  }

  return { ...parseHexColor(color), a: 1 };
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
  title = "Priority",
  surface,
  onOpenChange,
}: WorkspacePrioritySelectProps) {
  const meta = getWorkspacePriorityMeta(value);
  const Icon = meta.icon;
  const isDisabled = disabled || !onChange;
  const trigger = (
    <button
      type="button"
      disabled={isDisabled}
      title={title}
      className={cn(
        triggerVariant === "icon"
          ? "inline-flex size-8 items-center justify-center rounded-md text-foreground transition-colors hover:bg-muted"
          : "inline-flex h-6 items-center gap-1.5 rounded-md border border-border/60 bg-muted/35 px-2 text-xs text-foreground",
        !isDisabled && triggerVariant !== "icon" && "cursor-pointer transition-colors hover:bg-muted",
        triggerClassName,
      )}
    >
      <Icon className={cn("shrink-0", triggerVariant === "icon" ? "size-4" : "size-4", meta.className, iconClassName)} />
      {showLabel ? <span className={cn("font-medium", labelClassName)}>{meta.label}</span> : null}
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
                <span className="font-medium">{option.label}</span>
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
  title = "Status",
  surface,
  onOpenChange,
}: WorkspaceStatusSelectProps) {
  const meta = getWorkspaceWorkflowStatusMeta(value);
  const Icon = meta.icon;
  const isDisabled = disabled || !onChange;
  const trigger = (
    <button
      type="button"
      disabled={isDisabled}
      title={title}
      className={cn(
        triggerVariant === "icon"
          ? "inline-flex size-8 items-center justify-center rounded-md text-foreground transition-colors hover:bg-muted"
          : "inline-flex h-6 items-center gap-1.5 rounded-md border border-border/60 bg-muted/35 px-2 text-xs text-foreground",
        !isDisabled && triggerVariant !== "icon" && "cursor-pointer transition-colors hover:bg-muted",
        triggerClassName,
      )}
    >
      <Icon className={cn("size-3.5 shrink-0", meta.className, iconClassName)} />
      {showLabel ? <span className={cn(labelClassName)}>{meta.label}</span> : null}
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
                <span>{option.label}</span>
              </DropdownMenuRadioItem>
            );
          })}
        </DropdownMenuRadioGroup>
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
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const [isOpen, setIsOpen] = React.useState(false);
  const [labelEditorKey, setLabelEditorKey] = React.useState<string | null>(null);
  const [editingLabel, setEditingLabel] = React.useState<WorkspaceLabel | null>(null);
  const [labelSearchQuery, setLabelSearchQuery] = React.useState("");
  const [newLabelName, setNewLabelName] = React.useState("");
  const [newLabelColor, setNewLabelColor] = React.useState({ r: 59, g: 130, b: 246, a: 1 });

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
    setIsOpen(open);
    onOpenChange?.(open);
    if (!open) resetEditor();
  }, [onOpenChange, resetEditor]);

  const openLabelEditor = React.useCallback((label: WorkspaceLabel | null) => {
    setEditingLabel(label);
    setNewLabelName(label?.name ?? "");
    setNewLabelColor(label?.color ? parseColorToRgb(label.color) : { r: 59, g: 130, b: 246, a: 1 });
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
    const color = `rgba(${newLabelColor.r}, ${newLabelColor.g}, ${newLabelColor.b}, ${newLabelColor.a})`;
    const label = editingLabel && onUpdateLabel
      ? await onUpdateLabel(editingLabel.id, { name, color })
      : await onCreateLabel({ name, color });
    const nextLabels = selectedLabelIds.has(label.id) ? labels : [...labels, label];
    await onChange(nextLabels);
    setNewLabelName("");
    setLabelEditorKey(null);
    setEditingLabel(null);
  }, [editingLabel, labels, newLabelColor, newLabelName, onChange, onCreateLabel, onUpdateLabel, selectedLabelIds]);

  const trigger = (
    <button
      type="button"
      disabled={!onChange}
      title="Labels"
      className={cn(
        triggerVariant === "icon"
          ? "relative inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          : triggerVariant === "summary"
            ? "inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-background px-2 py-1 text-xs transition-colors hover:bg-muted"
            : "inline-flex h-6 items-center rounded-full border border-dashed border-foreground/25 bg-foreground/12 px-2 text-xs font-medium text-foreground transition-colors hover:bg-foreground/18",
        triggerClassName,
      )}
    >
      {triggerVariant === "add" ? (
        "+ Label"
      ) : (
        <>
          <Tags className="size-3.5 shrink-0" />
          {triggerVariant === "summary" ? (
            <span className="text-xs text-muted-foreground">
              {labels.length > 0 ? `${labels.length} labels` : "Add labels"}
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
                <span>Create New</span>
                <span className="text-muted-foreground">+</span>
              </button>
            </PopoverTrigger>
            <LabelEditorContent
              isDark={isDark}
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
          placeholder="Search labels"
          className="h-7 text-xs"
        />
        <div className="max-h-64 space-y-1 overflow-y-auto">
          {availableLabels.length === 0 ? (
            <div className="py-2 text-center text-xs text-muted-foreground">No labels yet</div>
          ) : filteredAvailableLabels.length === 0 ? (
            <div className="py-2 text-center text-xs text-muted-foreground">No matching labels</div>
          ) : filteredAvailableLabels.map((label) => (
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
                <span className="min-w-0 truncate">{label.name}</span>
              </div>
              {onUpdateLabel ? (
                <Popover
                  open={labelEditorKey === label.id}
                  onOpenChange={(open) => {
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
                      className="absolute right-2 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-colors hover:bg-muted hover:text-foreground group-hover/label-item:opacity-100"
                    >
                      <Pencil className="size-3" />
                    </button>
                  </PopoverTrigger>
                  <LabelEditorContent
                    isDark={isDark}
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
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function LabelEditorContent({
  isDark,
  side,
  surface,
  newLabelName,
  newLabelColor,
  editingLabel,
  setNewLabelName,
  setNewLabelColor,
  onSubmit,
}: {
  isDark: boolean;
  side: PopoverSide;
  surface?: boolean;
  newLabelName: string;
  newLabelColor: { r: number; g: number; b: number; a: number };
  editingLabel: WorkspaceLabel | null;
  setNewLabelName: (value: string) => void;
  setNewLabelColor: (value: { r: number; g: number; b: number; a: number }) => void;
  onSubmit: () => void;
}) {
  return (
    <PopoverContent
      data-workspace-popover-surface={surface ? "true" : undefined}
      side={side}
      align="start"
      sideOffset={8}
      alignOffset={28}
      avoidCollisions
      className="w-72 space-y-2 p-3"
    >
      <div className="flex items-center gap-2">
        <Input
          value={newLabelName}
          onChange={(event) => setNewLabelName(event.target.value)}
          placeholder={editingLabel ? "Label name" : "New label"}
          className="h-7 flex-1 text-xs"
          autoFocus
        />
        <Button
          size="sm"
          className="h-7 px-2 text-xs"
          disabled={!newLabelName.trim()}
          onClick={() => onSubmit()}
        >
          {editingLabel ? "Save" : "Add"}
        </Button>
      </div>
      <div className="grid grid-cols-6 gap-1">
        {LABEL_COLOR_PRESETS.map((preset) => (
          <button
            key={preset.name}
            type="button"
            onClick={() => setNewLabelColor({ ...parseHexColor(preset.color), a: 0.18 })}
            className="h-6 w-full rounded border border-border/50 transition-transform hover:scale-105"
            style={{ backgroundColor: preset.color }}
            title={preset.name}
          />
        ))}
      </div>
      <SketchPicker
        color={newLabelColor}
        onChange={(color) => {
          setNewLabelColor({
            r: color.rgb.r,
            g: color.rgb.g,
            b: color.rgb.b,
            a: color.rgb.a ?? 1,
          });
        }}
        styles={{
          default: {
            picker: {
              background: isDark ? "#1c1c1f" : "#fff",
              boxSizing: "border-box",
              borderRadius: "8px",
              boxShadow: "none",
              border: isDark ? "1px solid #27272a" : "1px solid #e4e4e7",
              padding: "10px",
              width: "100%",
            },
            saturation: { borderRadius: "8px" },
            activeColor: { borderRadius: "4px" },
            hue: { height: "10px", borderRadius: "4px" },
            alpha: { height: "10px", borderRadius: "4px" },
          },
        }}
      />
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
