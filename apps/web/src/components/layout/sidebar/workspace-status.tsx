"use client";

import React from "react";
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
import type { Project, Workspace, WorkspaceWorkflowStatus } from "@/types/types";
import {
  Ban,
  CheckCircle2,
  Clock3,
  CircleDashed,
  Eye,
  FolderKanban,
  LoaderCircle,
  OctagonAlert,
} from "lucide-react";

export type SidebarGroupingMode = "project" | "status" | "time";

type WorkflowStatusMeta = {
  value: WorkspaceWorkflowStatus;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  className: string;
};

const WORKFLOW_STATUS_META: Record<WorkspaceWorkflowStatus, WorkflowStatusMeta> = {
  todo: {
    value: "todo",
    label: "To Do",
    icon: CircleDashed,
    className: "text-slate-500",
  },
  in_progress: {
    value: "in_progress",
    label: "In Progress",
    icon: LoaderCircle,
    className: "text-blue-500",
  },
  in_review: {
    value: "in_review",
    label: "In Review",
    icon: Eye,
    className: "text-violet-500",
  },
  blocked: {
    value: "blocked",
    label: "Blocked",
    icon: OctagonAlert,
    className: "text-amber-500",
  },
  completed: {
    value: "completed",
    label: "Completed",
    icon: CheckCircle2,
    className: "text-emerald-500",
  },
  canceled: {
    value: "canceled",
    label: "Canceled",
    icon: Ban,
    className: "text-rose-500",
  },
};

export const SIDEBAR_GROUPING_OPTIONS: Array<{
  value: SidebarGroupingMode;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { value: "project", label: "By Project", icon: FolderKanban },
  { value: "status", label: "By Status", icon: CircleDashed },
  { value: "time", label: "By Time", icon: Clock3 },
];

export const WORKSPACE_WORKFLOW_STATUS_OPTIONS = Object.values(WORKFLOW_STATUS_META);

export function getWorkspaceWorkflowStatusMeta(status: WorkspaceWorkflowStatus): WorkflowStatusMeta {
  return WORKFLOW_STATUS_META[status];
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
};

export function WorkspaceStatusButton({
  status,
  onChange,
  className,
  iconClassName,
}: WorkspaceStatusButtonProps) {
  const meta = getWorkspaceWorkflowStatusMeta(status);
  const Icon = meta.icon;
  const trigger = (
    <button
      type="button"
      disabled={!onChange}
      className={cn(
        "flex size-5 items-center justify-center rounded-sm transition-colors",
        onChange
          ? "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground cursor-pointer"
          : "cursor-default text-muted-foreground",
        className,
      )}
    >
      <Icon className={cn("size-3.5", meta.className, iconClassName)} />
    </button>
  );

  if (!onChange) {
    return (
      <TooltipProvider delayDuration={250}>
        <Tooltip>
          <TooltipTrigger asChild>{trigger}</TooltipTrigger>
          <TooltipContent side="top">{meta.label}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <DropdownMenu>
      <TooltipProvider delayDuration={250}>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent side="top">{meta.label}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuRadioGroup
          value={status}
          onValueChange={(value) => onChange(value as WorkspaceWorkflowStatus)}
        >
          {WORKSPACE_WORKFLOW_STATUS_OPTIONS.map((option) => {
            const OptionIcon = option.icon;
            return (
              <DropdownMenuRadioItem key={option.value} value={option.value} className="cursor-pointer">
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
