import type { ComponentType } from "react";
import Svg, { Circle, Path } from "react-native-svg";
import type { MobileThemeColors } from "@/theme/colors";

export type WorkspaceWorkflowStatus =
  | "backlog"
  | "todo"
  | "in_progress"
  | "in_review"
  | "blocked"
  | "completed"
  | "canceled";

export type WorkspaceStatusIconProps = {
  color: string;
  size?: number;
};

type WorkspaceWorkflowStatusMeta = {
  value: WorkspaceWorkflowStatus;
  label: string;
  Icon: ComponentType<WorkspaceStatusIconProps>;
};

const WORKSPACE_WORKFLOW_STATUS_META: Record<WorkspaceWorkflowStatus, WorkspaceWorkflowStatusMeta> = {
  backlog: {
    value: "backlog",
    label: "Backlog",
    Icon: StatusBacklogIcon,
  },
  todo: {
    value: "todo",
    label: "To Do",
    Icon: StatusTodoIcon,
  },
  in_progress: {
    value: "in_progress",
    label: "In Progress",
    Icon: StatusInProgressIcon,
  },
  in_review: {
    value: "in_review",
    label: "In Review",
    Icon: StatusInReviewIcon,
  },
  blocked: {
    value: "blocked",
    label: "Blocked",
    Icon: StatusBlockedIcon,
  },
  completed: {
    value: "completed",
    label: "Completed",
    Icon: StatusCompletedIcon,
  },
  canceled: {
    value: "canceled",
    label: "Canceled",
    Icon: StatusCanceledIcon,
  },
};

export const WORKSPACE_WORKFLOW_STATUS_OPTIONS = Object.values(WORKSPACE_WORKFLOW_STATUS_META);

export function normalizeWorkspaceWorkflowStatus(status: string | null | undefined): WorkspaceWorkflowStatus {
  if (status && status in WORKSPACE_WORKFLOW_STATUS_META) {
    return status as WorkspaceWorkflowStatus;
  }
  return "in_progress";
}

export function getWorkspaceWorkflowStatusMeta(status: string | null | undefined) {
  return WORKSPACE_WORKFLOW_STATUS_META[normalizeWorkspaceWorkflowStatus(status)];
}

export function getWorkspaceWorkflowStatusColor(
  status: WorkspaceWorkflowStatus,
  themeColors: MobileThemeColors,
) {
  switch (status) {
    case "in_progress":
      return "#3b82f6";
    case "in_review":
      return "#10b981";
    case "blocked":
      return "#f59e0b";
    case "completed":
      return "#6366f1";
    case "backlog":
    case "todo":
    case "canceled":
      return themeColors.secondaryLabel;
  }
}

function StatusBacklogIcon({ color, size = 16 }: WorkspaceStatusIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <Circle cx="8" cy="8" r="6.5" stroke={color} strokeWidth="1.5" strokeDasharray={[3, 2.5]} />
    </Svg>
  );
}

function StatusTodoIcon({ color, size = 16 }: WorkspaceStatusIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <Circle cx="8" cy="8" r="6.5" stroke={color} strokeWidth="1.5" />
    </Svg>
  );
}

function StatusInProgressIcon({ color, size = 16 }: WorkspaceStatusIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <Circle cx="8" cy="8" r="6.5" stroke={color} strokeWidth="1.5" opacity="0.3" />
      <Path d="M8 1.5 A6.5 6.5 0 0 1 14.5 8" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    </Svg>
  );
}

function StatusInReviewIcon({ color, size = 16 }: WorkspaceStatusIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <Circle cx="8" cy="8" r="6.5" stroke={color} strokeWidth="1.5" opacity="0.3" />
      <Path d="M8 1.5 A6.5 6.5 0 1 1 1.5 8" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    </Svg>
  );
}

function StatusCompletedIcon({ color, size = 16 }: WorkspaceStatusIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <Circle cx="8" cy="8" r="6.5" stroke={color} strokeWidth="1.5" />
      <Path
        d="M5.5 8L7.2 9.7L10.5 6.3"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function StatusBlockedIcon({ color, size = 16 }: WorkspaceStatusIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <Circle cx="8" cy="8" r="6.5" stroke={color} strokeWidth="1.5" />
      <Path d="M5.5 8h5" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    </Svg>
  );
}

function StatusCanceledIcon({ color, size = 16 }: WorkspaceStatusIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <Circle cx="8" cy="8" r="6.5" stroke={color} strokeWidth="1.5" />
      <Path d="M6 6l4 4M10 6l-4 4" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    </Svg>
  );
}
