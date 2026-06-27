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

export type CanvasWidgetGroupId = "workspace" | "code-review" | "agents" | "usage";

export type CanvasWidgetGroup = {
  id: CanvasWidgetGroupId;
  label: string;
};

export type CanvasWidgetRegistryEntry = {
  type: CanvasWidgetType;
  group: CanvasWidgetGroupId;
  label: string;
  description: string;
  icon: LucideIcon;
  defaultSize: { w: number; h: number };
  addable: boolean;
  requiresContext: boolean;
};

export const CANVAS_WIDGET_GROUPS: CanvasWidgetGroup[] = [
  { id: "workspace", label: "Workspace" },
  { id: "code-review", label: "Code & Review" },
  { id: "agents", label: "Agents" },
  { id: "usage", label: "Usage" },
];

export const CANVAS_WIDGET_REGISTRY: Record<CanvasWidgetType, CanvasWidgetRegistryEntry> = {
  "workspace-context": {
    type: "workspace-context",
    group: "workspace",
    label: "Workspace Context",
    description: "Notes, tasks, and requirements for a project or workspace.",
    icon: ListChecks,
    defaultSize: CANVAS_WIDGET_DEFAULT_SIZES["workspace-context"],
    addable: true,
    requiresContext: true,
  },
  files: {
    type: "files",
    group: "code-review",
    label: "Files",
    description: "Browse files and open them into Main Operating Area tabs.",
    icon: Files,
    defaultSize: CANVAS_WIDGET_DEFAULT_SIZES.files,
    addable: true,
    requiresContext: true,
  },
  changes: {
    type: "changes",
    group: "code-review",
    label: "Changes",
    description: "Review staged, unstaged, untracked, and compare diffs.",
    icon: FolderGit2,
    defaultSize: CANVAS_WIDGET_DEFAULT_SIZES.changes,
    addable: true,
    requiresContext: true,
  },
  review: {
    type: "review",
    group: "code-review",
    label: "Review",
    description: "Inspect review sessions, comments, and reviewed state.",
    icon: GitPullRequest,
    defaultSize: CANVAS_WIDGET_DEFAULT_SIZES.review,
    addable: true,
    requiresContext: true,
  },
  center: {
    type: "center",
    group: "workspace",
    label: "Main Operating Area",
    description: "Overview, files, diffs, and review tabs for a workspace.",
    icon: PanelTop,
    defaultSize: CANVAS_WIDGET_DEFAULT_SIZES.center,
    addable: true,
    requiresContext: true,
  },
  "agent-status": {
    type: "agent-status",
    group: "agents",
    label: "Agent Status Board",
    description: "Monitor running, idle, and permission-waiting agent sessions.",
    icon: Activity,
    defaultSize: CANVAS_WIDGET_DEFAULT_SIZES["agent-status"],
    addable: true,
    requiresContext: false,
  },
  "ai-quota-usage": {
    type: "ai-quota-usage",
    group: "usage",
    label: "AI Quota Usage",
    description: "Inspect provider quota, usage, refresh state, and footer sources.",
    icon: Gauge,
    defaultSize: CANVAS_WIDGET_DEFAULT_SIZES["ai-quota-usage"],
    addable: true,
    requiresContext: false,
  },
  "agent-chat": {
    type: "agent-chat",
    group: "agents",
    label: "Agent ACP Chat",
    description: "Use the existing ACP agent chat panel inside the canvas.",
    icon: BotMessageSquare,
    defaultSize: CANVAS_WIDGET_DEFAULT_SIZES["agent-chat"],
    addable: true,
    requiresContext: false,
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
