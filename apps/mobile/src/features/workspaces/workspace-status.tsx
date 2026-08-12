import type { ComponentType } from "react";
import Svg, { Circle, Path } from "react-native-svg";
import type { SFSymbol } from "sf-symbols-typescript";
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
  Icon: ComponentType<WorkspaceStatusIconProps>;
  label: string;
  menuSystemImage: SFSymbol;
  value: WorkspaceWorkflowStatus;
};

const WORKSPACE_WORKFLOW_STATUS_META: Record<WorkspaceWorkflowStatus, WorkspaceWorkflowStatusMeta> = {
  backlog: {
    value: "backlog",
    label: "Backlog",
    menuSystemImage: "circle.dashed",
    Icon: StatusBacklogIcon,
  },
  todo: {
    value: "todo",
    label: "To Do",
    menuSystemImage: "circle",
    Icon: StatusTodoIcon,
  },
  in_progress: {
    value: "in_progress",
    label: "In Progress",
    menuSystemImage: "circle.lefthalf.filled",
    Icon: StatusInProgressIcon,
  },
  in_review: {
    value: "in_review",
    label: "In Review",
    menuSystemImage: "eye.circle",
    Icon: StatusInReviewIcon,
  },
  blocked: {
    value: "blocked",
    label: "Blocked",
    menuSystemImage: "minus.circle",
    Icon: StatusBlockedIcon,
  },
  completed: {
    value: "completed",
    label: "Completed",
    menuSystemImage: "checkmark.circle",
    Icon: StatusCompletedIcon,
  },
  canceled: {
    value: "canceled",
    label: "Canceled",
    menuSystemImage: "xmark.circle",
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
      return themeColors.workflowStatusInProgress;
    case "in_review":
      return themeColors.workflowStatusInReview;
    case "blocked":
      return themeColors.workflowStatusBlocked;
    case "completed":
      return themeColors.workflowStatusCompleted;
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
