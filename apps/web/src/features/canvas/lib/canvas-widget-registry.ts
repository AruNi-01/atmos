import {
  Activity,
  BotMessageSquare,
  Files,
  FolderGit2,
  Gauge,
  GitPullRequest,
  ListChecks,
  PanelTop,
  type LucideIcon,
} from "lucide-react";

import type { CanvasWidgetType } from "./canvas-widget-shape";
import { CANVAS_WIDGET_DEFAULT_SIZES } from "./canvas-widget-shape";

export type AddableCanvasWidgetType = CanvasWidgetType;

export type CanvasWidgetRegistryEntry = {
  type: CanvasWidgetType;
  label: string;
  description: string;
  icon: LucideIcon;
  defaultSize: { w: number; h: number };
  addable: boolean;
};

export const CANVAS_WIDGET_REGISTRY: Record<CanvasWidgetType, CanvasWidgetRegistryEntry> = {
  "workspace-context": {
    type: "workspace-context",
    label: "Workspace Context",
    description: "Notes, tasks, and requirements for a project or workspace.",
    icon: ListChecks,
    defaultSize: CANVAS_WIDGET_DEFAULT_SIZES["workspace-context"],
    addable: true,
  },
  files: {
    type: "files",
    label: "Files",
    description: "Browse files and open them into Main Operating Area tabs.",
    icon: Files,
    defaultSize: CANVAS_WIDGET_DEFAULT_SIZES.files,
    addable: true,
  },
  changes: {
    type: "changes",
    label: "Changes",
    description: "Review staged, unstaged, untracked, and compare diffs.",
    icon: FolderGit2,
    defaultSize: CANVAS_WIDGET_DEFAULT_SIZES.changes,
    addable: true,
  },
  review: {
    type: "review",
    label: "Review",
    description: "Inspect review sessions, comments, and reviewed state.",
    icon: GitPullRequest,
    defaultSize: CANVAS_WIDGET_DEFAULT_SIZES.review,
    addable: true,
  },
  center: {
    type: "center",
    label: "Main Operating Area",
    description: "Overview, files, diffs, and review tabs for a workspace.",
    icon: PanelTop,
    defaultSize: CANVAS_WIDGET_DEFAULT_SIZES.center,
    addable: true,
  },
  "agent-status": {
    type: "agent-status",
    label: "Agent Status Board",
    description: "Monitor running, idle, and permission-waiting agent sessions.",
    icon: Activity,
    defaultSize: CANVAS_WIDGET_DEFAULT_SIZES["agent-status"],
    addable: true,
  },
  "ai-quota-usage": {
    type: "ai-quota-usage",
    label: "AI Quota Usage",
    description: "Inspect provider quota, usage, refresh state, and footer sources.",
    icon: Gauge,
    defaultSize: CANVAS_WIDGET_DEFAULT_SIZES["ai-quota-usage"],
    addable: true,
  },
  "agent-chat": {
    type: "agent-chat",
    label: "Agent ACP Chat",
    description: "Use the existing ACP agent chat panel inside the canvas.",
    icon: BotMessageSquare,
    defaultSize: CANVAS_WIDGET_DEFAULT_SIZES["agent-chat"],
    addable: true,
  },
};

export const ADDABLE_CANVAS_WIDGET_TYPES: AddableCanvasWidgetType[] = [
  "center",
  "workspace-context",
  "files",
  "changes",
  "review",
  "agent-status",
  "ai-quota-usage",
  "agent-chat",
];
