import {
  Activity,
  BotMessageSquare,
  Files,
  FolderGit2,
  Gauge,
  GitPullRequest,
  Globe,
  ListChecks,
  PanelTop,
  type LucideIcon,
} from "lucide-react";
import { createTranslator } from "next-intl";
import enMessages from "../../../../messages/en.json";
import zhMessages from "../../../../messages/zh.json";
import { currentAppLocale } from "@/shared/lib/current-app-locale";

import type { CanvasWidgetType } from "./canvas-widget-shape";
import { CANVAS_WIDGET_DEFAULT_SIZES } from "./canvas-widget-shape";

export type AddableCanvasWidgetType = CanvasWidgetType;

export type CanvasWidgetGroupId = "workspace" | "browser" | "code-review" | "agents" | "usage";

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

let cachedCanvasWidgetRegistryLocale: "en" | "zh" | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cachedCanvasWidgetRegistryTranslator: any = null;

function canvasWidgetRegistryT(key: string): string {
  const locale = currentAppLocale("en") === "zh" ? "zh" : "en";
  if (!cachedCanvasWidgetRegistryTranslator || cachedCanvasWidgetRegistryLocale !== locale) {
    cachedCanvasWidgetRegistryLocale = locale;
    cachedCanvasWidgetRegistryTranslator = createTranslator({
      locale,
      messages: locale === "zh" ? zhMessages : enMessages,
      namespace: "canvas.widgetRegistry",
    });
  }
  return cachedCanvasWidgetRegistryTranslator(key as never);
}

export const CANVAS_WIDGET_GROUPS: CanvasWidgetGroup[] = [
  { id: "workspace", label: canvasWidgetRegistryT("groups.workspace") },
  { id: "browser", label: canvasWidgetRegistryT("groups.browser") },
  { id: "code-review", label: canvasWidgetRegistryT("groups.codeReview") },
  { id: "agents", label: canvasWidgetRegistryT("groups.agents") },
  { id: "usage", label: canvasWidgetRegistryT("groups.usage") },
];

export const CANVAS_WIDGET_REGISTRY: Record<CanvasWidgetType, CanvasWidgetRegistryEntry> = {
  "workspace-context": {
    type: "workspace-context",
    group: "workspace",
    label: canvasWidgetRegistryT("items.workspaceContext.label"),
    description: canvasWidgetRegistryT("items.workspaceContext.description"),
    icon: ListChecks,
    defaultSize: CANVAS_WIDGET_DEFAULT_SIZES["workspace-context"],
    addable: true,
    requiresContext: true,
  },
  files: {
    type: "files",
    group: "code-review",
    label: canvasWidgetRegistryT("items.files.label"),
    description: canvasWidgetRegistryT("items.files.description"),
    icon: Files,
    defaultSize: CANVAS_WIDGET_DEFAULT_SIZES.files,
    addable: true,
    requiresContext: true,
  },
  changes: {
    type: "changes",
    group: "code-review",
    label: canvasWidgetRegistryT("items.changes.label"),
    description: canvasWidgetRegistryT("items.changes.description"),
    icon: FolderGit2,
    defaultSize: CANVAS_WIDGET_DEFAULT_SIZES.changes,
    addable: true,
    requiresContext: true,
  },
  review: {
    type: "review",
    group: "code-review",
    label: canvasWidgetRegistryT("items.review.label"),
    description: canvasWidgetRegistryT("items.review.description"),
    icon: GitPullRequest,
    defaultSize: CANVAS_WIDGET_DEFAULT_SIZES.review,
    addable: true,
    requiresContext: true,
  },
  center: {
    type: "center",
    group: "workspace",
    label: canvasWidgetRegistryT("items.center.label"),
    description: canvasWidgetRegistryT("items.center.description"),
    icon: PanelTop,
    defaultSize: CANVAS_WIDGET_DEFAULT_SIZES.center,
    addable: true,
    requiresContext: true,
  },
  browser: {
    type: "browser",
    group: "browser",
    label: canvasWidgetRegistryT("items.browser.label"),
    description: canvasWidgetRegistryT("items.browser.description"),
    icon: Globe,
    defaultSize: CANVAS_WIDGET_DEFAULT_SIZES.browser,
    addable: true,
    requiresContext: false,
  },
  "agent-status": {
    type: "agent-status",
    group: "agents",
    label: canvasWidgetRegistryT("items.agentStatus.label"),
    description: canvasWidgetRegistryT("items.agentStatus.description"),
    icon: Activity,
    defaultSize: CANVAS_WIDGET_DEFAULT_SIZES["agent-status"],
    addable: true,
    requiresContext: false,
  },
  "ai-quota-usage": {
    type: "ai-quota-usage",
    group: "usage",
    label: canvasWidgetRegistryT("items.aiQuotaUsage.label"),
    description: canvasWidgetRegistryT("items.aiQuotaUsage.description"),
    icon: Gauge,
    defaultSize: CANVAS_WIDGET_DEFAULT_SIZES["ai-quota-usage"],
    addable: true,
    requiresContext: false,
  },
  "agent-chat": {
    type: "agent-chat",
    group: "agents",
    label: canvasWidgetRegistryT("items.agentChat.label"),
    description: canvasWidgetRegistryT("items.agentChat.description"),
    icon: BotMessageSquare,
    defaultSize: CANVAS_WIDGET_DEFAULT_SIZES["agent-chat"],
    addable: true,
    requiresContext: false,
  },
};

export const ADDABLE_CANVAS_WIDGET_TYPES: AddableCanvasWidgetType[] = [
  "center",
  "browser",
  "workspace-context",
  "files",
  "changes",
  "review",
  "agent-status",
  "ai-quota-usage",
  "agent-chat",
];
