"use client";

import React from "react";
import { useTranslations } from "next-intl";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  cn,
} from "@workspace/ui";
import type { Project, Workspace, WorkspaceWorkflowStatus } from "@/shared/types/domain";
import {
  Bell,
  Bot,
  CircleCheck,
  Clock3,
  Flag,
  FolderKanban,
  Folders,
  LoaderCircle,
  ShieldAlert,
  Tags,
} from "lucide-react";
import {
  parseWorkspaceAgentGroupKey,
  WORKSPACE_AGENT_GROUP_ORDER,
  type WorkspaceAgentGroupKey,
} from "@/features/agent/lib/workspace-agent-status";

export type SidebarGroupingMode =
  | "project"
  | "group"
  | "status"
  | "time"
  | "label"
  | "priority"
  | "agent";

export const SIDEBAR_GROUPING_MODES: readonly SidebarGroupingMode[] = [
  "project",
  "group",
  "status",
  "time",
  "label",
  "priority",
  "agent",
] as const;

export function parseSidebarGroupingMode(value: unknown): SidebarGroupingMode {
  return SIDEBAR_GROUPING_MODES.includes(value as SidebarGroupingMode)
    ? (value as SidebarGroupingMode)
    : "project";
}

// Linear-style circular status icons
function StatusBacklog({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" className={className}>
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 2.5" />
    </svg>
  );
}

function StatusTodo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" className={className}>
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function StatusInProgress({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" className={className}>
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5" opacity="0.3" />
      <path d="M8 1.5 A6.5 6.5 0 0 1 14.5 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function StatusInReview({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" className={className}>
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5" opacity="0.3" />
      <path d="M8 1.5 A6.5 6.5 0 1 1 1.5 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function StatusCompleted({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" className={className}>
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M5.5 8L7.2 9.7L10.5 6.3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function StatusBlocked({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" className={className}>
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M5.5 8h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function StatusCanceled({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" className={className}>
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M6 6l4 4M10 6l-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

/** Remainder bucket for missing / unknown workflow status (not a settable status). */
function StatusNone({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" className={className}>
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5" opacity="0.35" />
    </svg>
  );
}

export const NO_STATUS_WORKSPACE_GROUP_KEY = "__no_status__";

type WorkflowStatusVisual = {
  label: string;
  labelKey: string;
  icon: React.ComponentType<{ className?: string }>;
  className: string;
};

type WorkflowStatusMeta = WorkflowStatusVisual & {
  value: WorkspaceWorkflowStatus;
};

const WORKFLOW_STATUS_META: Record<WorkspaceWorkflowStatus, WorkflowStatusMeta> = {
  backlog: {
    value: "backlog",
    label: "Backlog",
    labelKey: "status.backlog",
    icon: StatusBacklog,
    className: "text-muted-foreground",
  },
  todo: {
    value: "todo",
    label: "To Do",
    labelKey: "status.todo",
    icon: StatusTodo,
    className: "text-muted-foreground",
  },
  in_progress: {
    value: "in_progress",
    label: "In Progress",
    labelKey: "status.inProgress",
    icon: StatusInProgress,
    className: "text-blue-500",
  },
  in_review: {
    value: "in_review",
    label: "In Review",
    labelKey: "status.inReview",
    icon: StatusInReview,
    className: "text-emerald-500",
  },
  blocked: {
    value: "blocked",
    label: "Blocked",
    labelKey: "status.blocked",
    icon: StatusBlocked,
    className: "text-amber-500",
  },
  completed: {
    value: "completed",
    label: "Completed",
    labelKey: "status.completed",
    icon: StatusCompleted,
    className: "text-indigo-500",
  },
  canceled: {
    value: "canceled",
    label: "Canceled",
    labelKey: "status.canceled",
    icon: StatusCanceled,
    className: "text-muted-foreground",
  },
};

export const SIDEBAR_GROUPING_OPTIONS: Array<{
  value: SidebarGroupingMode;
  label: string;
  labelKey: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { value: "project", label: "By Project", labelKey: "grouping.project", icon: FolderKanban },
  { value: "group", label: "By Group", labelKey: "grouping.group", icon: Folders },
  { value: "status", label: "By Status", labelKey: "grouping.status", icon: StatusBacklog },
  { value: "agent", label: "By Agent Status", labelKey: "grouping.agent", icon: Bot },
  { value: "time", label: "By Time", labelKey: "grouping.time", icon: Clock3 },
  { value: "label", label: "By Label", labelKey: "grouping.label", icon: Tags },
  { value: "priority", label: "By Priority", labelKey: "grouping.priority", icon: Flag },
];

type AgentGroupMeta = {
  value: WorkspaceAgentGroupKey;
  labelKey: string;
  groupingLabelKey: string;
  icon: React.ComponentType<{ className?: string }>;
  className: string;
  color: string;
};

const AGENT_GROUP_META: Record<WorkspaceAgentGroupKey, AgentGroupMeta> = {
  permission: {
    value: "permission",
    labelKey: "agentStatus.permission",
    groupingLabelKey: "agent_permission",
    icon: ShieldAlert,
    className: "text-amber-500",
    color: "#f59e0b",
  },
  attention: {
    value: "attention",
    labelKey: "agentStatus.attention",
    groupingLabelKey: "agent_attention",
    icon: Bell,
    className: "text-emerald-500",
    color: "#10b981",
  },
  running: {
    value: "running",
    labelKey: "agentStatus.running",
    groupingLabelKey: "agent_running",
    icon: LoaderCircle,
    className: "text-blue-500",
    color: "#3b82f6",
  },
  done: {
    value: "done",
    labelKey: "agentStatus.done",
    groupingLabelKey: "agent_done",
    icon: CircleCheck,
    className: "text-muted-foreground",
    color: "#94a3b8",
  },
};

export const WORKSPACE_AGENT_GROUP_OPTIONS = WORKSPACE_AGENT_GROUP_ORDER.map(
  (key) => AGENT_GROUP_META[key],
);

export function getWorkspaceAgentGroupMeta(key: string): AgentGroupMeta {
  return AGENT_GROUP_META[parseWorkspaceAgentGroupKey(key)];
}

export const WORKSPACE_WORKFLOW_STATUS_OPTIONS = Object.values(WORKFLOW_STATUS_META);

const NO_STATUS_META: WorkflowStatusVisual = {
  label: "No status",
  labelKey: "status.noStatus",
  icon: StatusNone,
  className: "text-muted-foreground/70",
};

const WORKSPACE_WORKFLOW_STATUS_VALUES = new Set<string>(
  Object.keys(WORKFLOW_STATUS_META),
);

export function isWorkspaceWorkflowStatus(value: unknown): value is WorkspaceWorkflowStatus {
  return typeof value === "string" && WORKSPACE_WORKFLOW_STATUS_VALUES.has(value);
}

export function getWorkspaceWorkflowStatusMeta(
  status: WorkspaceWorkflowStatus | string,
): WorkflowStatusVisual {
  return isWorkspaceWorkflowStatus(status) ? WORKFLOW_STATUS_META[status] : NO_STATUS_META;
}

function getWorkspaceRecencyTimestamp(workspace: Workspace): number {
  const source = workspace.lastVisitedAt ?? workspace.createdAt;
  return source ? new Date(source).getTime() : 0;
}

export function getProjectWorkflowStatus(project: Project): WorkspaceWorkflowStatus {
  if (project.workspaces.length === 0) return "todo";

  return [...project.workspaces]
    .sort((a, b) => getWorkspaceRecencyTimestamp(b) - getWorkspaceRecencyTimestamp(a))[0]
    .workflowStatus;
}

type WorkspaceStatusButtonProps = {
  status: WorkspaceWorkflowStatus;
  onChange?: (nextStatus: WorkspaceWorkflowStatus) => void;
  className?: string;
  iconClassName?: string;
  showTooltip?: boolean;
  onOpenChange?: (open: boolean) => void;
};

export function WorkspaceStatusButton({
  status,
  onChange,
  className,
  iconClassName,
  showTooltip = true,
  onOpenChange,
}: WorkspaceStatusButtonProps) {
  const t = useTranslations("appShell.task");
  const meta = getWorkspaceWorkflowStatusMeta(status);
  const Icon = meta.icon;
  const translatedStatusLabel = t(meta.labelKey);
  const trigger = (
    <button
      type="button"
      disabled={!onChange}
      className={cn(
        "flex size-5 items-center justify-center rounded-sm",
        onChange
          ? "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground cursor-pointer"
          : "cursor-default text-muted-foreground",
        className,
      )}
    >
      <Icon className={cn("size-3.5", meta.className, iconClassName)} />
    </button>
  );

  if (!showTooltip) {
    if (!onChange) {
      return trigger;
    }

    return (
      <DropdownMenu modal={false} onOpenChange={onOpenChange}>
        <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
        <DropdownMenuContent side="right" align="start" className="w-40">
          <DropdownMenuRadioGroup
            value={status}
            onValueChange={(value) => onChange(value as WorkspaceWorkflowStatus)}
          >
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

  if (!onChange) {
    return (
      <TooltipProvider delayDuration={250}>
        <Tooltip>
          <TooltipTrigger asChild>{trigger}</TooltipTrigger>
          <TooltipContent side="top">{translatedStatusLabel}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <DropdownMenu modal={false} onOpenChange={onOpenChange}>
      <TooltipProvider delayDuration={250}>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent side="top">{translatedStatusLabel}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <DropdownMenuContent side="right" align="start" className="w-40">
        <DropdownMenuRadioGroup
          value={status}
          onValueChange={(value) => onChange(value as WorkspaceWorkflowStatus)}
        >
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
