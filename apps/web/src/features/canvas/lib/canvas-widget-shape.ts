"use client";

import { createTranslator } from "next-intl";
import {
  BaseBoxShapeUtil,
  T,
  type Editor,
  type TLEditorSnapshot,
  type TLShape,
  type TLShapeId,
} from "tldraw";
import enMessages from "../../../../messages/en.json";
import zhMessages from "../../../../messages/zh.json";
import { currentAppLocale } from "@/shared/lib/current-app-locale";

import type { CanvasCenterTab } from "./canvas-center-tabs";
import {
  CANVAS_CARD_CORNER_RADIUS,
  createCanvasCardIndicatorPath,
} from "./canvas-shape-indicator";

export const CANVAS_WIDGET_SHAPE_TYPE = "canvas-widget" as const;

export type CanvasWidgetType =
  | "workspace-context"
  | "files"
  | "changes"
  | "review"
  | "pull-requests"
  | "actions"
  | "center"
  | "browser"
  | "agent-status"
  | "ai-quota-usage"
  | "agent-chat";

export type CanvasContextRef = {
  contextKind?: "global";
  contextScope: "project" | "workspace";
  projectId: string | null;
  workspaceId: string | null;
  projectName: string;
  workspaceName: string | null;
  localPath: string;
  repoPath: string | null;
};

export type CanvasWidgetSourceRef =
  | {
      type: "workspace-context";
      context: CanvasContextRef;
      sections: Array<"notes" | "tasks" | "requirements">;
    }
  | {
      type: "files";
      context: CanvasContextRef;
      rootPath: string;
      showHidden?: boolean;
    }
  | {
      type: "changes";
      context: CanvasContextRef;
      group?: "all" | "staged" | "unstaged" | "untracked" | "compare";
    }
  | {
      type: "review";
      context: CanvasContextRef;
      sessionGuid?: string;
      revisionGuid?: string;
    }
  | {
      type: "pull-requests";
      context: CanvasContextRef;
      prSubTab?: "open" | "closed";
    }
  | {
      type: "actions";
      context: CanvasContextRef;
    }
  | {
      type: "center";
      context: CanvasContextRef;
      tabs: CanvasCenterTab[];
      activeTabId: string | null;
    }
  | {
      type: "browser";
      context: CanvasContextRef;
      browserId: string;
    }
  | {
      type: "agent-status";
      context: CanvasContextRef;
    }
  | {
      type: "ai-quota-usage";
      context: CanvasContextRef;
    }
  | {
      type: "agent-chat";
      context: CanvasContextRef;
      /**
       * Stable per-widget instance id (isolates conversation storage).
       * Older shapes may omit this — fall back to shape id at runtime.
       */
      instanceId?: string;
      /** Atmos conversation bound to this widget (persisted in the document file). */
      conversationId?: string | null;
    };

export type CanvasWidgetShapeProps = {
  w: number;
  h: number;
  widgetType: CanvasWidgetType;
  title: string;
  source: CanvasWidgetSourceRef;
  isPinned: boolean;
  pinKey: string;
  lastActivatedAt: number | null;
  displayMode: "auto" | "compact" | "expanded";
};

declare module "tldraw" {
  interface TLGlobalShapePropsMap {
    [CANVAS_WIDGET_SHAPE_TYPE]: CanvasWidgetShapeProps;
  }
}

export type CanvasWidgetShape = TLShape<typeof CANVAS_WIDGET_SHAPE_TYPE>;

export const CANVAS_WIDGET_DEFAULT_SIZES: Record<CanvasWidgetType, { w: number; h: number }> = {
  "workspace-context": { w: 900, h: 680 },
  files: { w: 360, h: 520 },
  changes: { w: 390, h: 500 },
  review: { w: 410, h: 520 },
  "pull-requests": { w: 390, h: 520 },
  actions: { w: 390, h: 520 },
  center: { w: 860, h: 600 },
  browser: { w: 920, h: 640 },
  "agent-status": { w: 420, h: 520 },
  "ai-quota-usage": { w: 560, h: 640 },
  "agent-chat": { w: 520, h: 680 },
};

let cachedCanvasWidgetShapeLocale: "en" | "zh" | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cachedCanvasWidgetShapeTranslator: any = null;

function canvasWidgetShapeT(key: string): string {
  const locale = currentAppLocale("en") === "zh" ? "zh" : "en";
  if (!cachedCanvasWidgetShapeTranslator || cachedCanvasWidgetShapeLocale !== locale) {
    cachedCanvasWidgetShapeLocale = locale;
    cachedCanvasWidgetShapeTranslator = createTranslator({
      locale,
      messages: locale === "zh" ? zhMessages : enMessages,
      namespace: "canvas.widgetShape",
    });
  }
  return cachedCanvasWidgetShapeTranslator(key as never);
}

export class CanvasWidgetShapeSchemaUtil extends BaseBoxShapeUtil<CanvasWidgetShape> {
  static override type = CANVAS_WIDGET_SHAPE_TYPE;

  static override props = {
    w: T.number,
    h: T.number,
    widgetType: T.string,
    title: T.string,
    source: T.jsonValue,
    isPinned: T.boolean,
    pinKey: T.string,
    lastActivatedAt: T.nullable(T.number),
    displayMode: T.string,
  };

  override canEdit() {
    return false;
  }

  override canScroll() {
    return true;
  }

  getDefaultProps(): CanvasWidgetShape["props"] {
    return createCanvasWidgetShapeProps({
      widgetType: "workspace-context",
      title: canvasWidgetShapeT("titles.workspaceContext"),
      source: {
        type: "workspace-context",
        context: createEmptyCanvasContextRef(),
        sections: ["notes", "tasks", "requirements"],
      },
    });
  }

  component(shape: CanvasWidgetShape): React.JSX.Element | null {
    void shape;
    return null;
  }

  override hideSelectionBoundsFg() {
    return true;
  }

  getIndicatorPath(shape: CanvasWidgetShape) {
    return createCanvasCardIndicatorPath(
      shape.props.w,
      shape.props.h,
      getCanvasWidgetIndicatorCornerRadius(shape),
    );
  }
}

export function getCanvasWidgetIndicatorCornerRadius(
  _shape: Pick<CanvasWidgetShape, "props">,
) {
  return CANVAS_CARD_CORNER_RADIUS;
}

function createEmptyCanvasContextRef(): CanvasContextRef {
  return {
    contextScope: "workspace",
    projectId: null,
    workspaceId: null,
    projectName: "",
    workspaceName: null,
    localPath: "",
    repoPath: null,
  };
}

export function createGlobalCanvasContextRef(): CanvasContextRef {
  return {
    contextKind: "global",
    contextScope: "workspace",
    projectId: null,
    workspaceId: null,
    projectName: canvasWidgetShapeT("context.global"),
    workspaceName: canvasWidgetShapeT("context.global"),
    localPath: "",
    repoPath: null,
  };
}

function normalizeDisplayMode(value: unknown): CanvasWidgetShapeProps["displayMode"] {
  return value === "compact" || value === "expanded" ? value : "auto";
}

function normalizeLastActivatedAt(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function sanitizeJsonValue(value: unknown): unknown {
  if (
    value === undefined ||
    typeof value === "function" ||
    typeof value === "symbol"
  ) {
    return undefined;
  }
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (Array.isArray(value)) {
    return value
      .map((item) => sanitizeJsonValue(item))
      .filter((item) => item !== undefined);
  }
  if (typeof value === "object") {
    const next: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      const sanitized = sanitizeJsonValue(entry);
      if (sanitized !== undefined) {
        next[key] = sanitized;
      }
    }
    return next;
  }
  return undefined;
}

export function sanitizeCanvasWidgetSource<T extends CanvasWidgetSourceRef>(source: T): T {
  const sanitized = sanitizeJsonValue(source) as T;
  if (sanitized.type !== "center" || !Array.isArray(sanitized.tabs)) {
    return sanitized;
  }

  // Action run status goes stale quickly; detail view re-fetches by runId.
  // Persist may contain malformed tab entries; drop non-objects before mapping.
  const tabs = (sanitized.tabs as unknown[])
    .filter((tab): tab is CanvasCenterTab => {
      if (tab === null || typeof tab !== "object") return false;
      return "kind" in tab;
    })
    .map((tab) => (tab.kind === "github-action" ? { ...tab, run: null } : tab));

  return {
    ...sanitized,
    tabs,
  } as T;
}

export function getCanvasContextId(context: CanvasContextRef): string {
  return context.contextScope === "project"
    ? (context.projectId ?? "")
    : (context.workspaceId ?? "");
}

export function hasConcreteCanvasContext(context: CanvasContextRef): boolean {
  return Boolean(getCanvasContextId(context));
}

export function isGlobalCanvasContext(context: CanvasContextRef): boolean {
  return context.contextKind === "global";
}

export function getCanvasContextLabel(context: CanvasContextRef): string {
  if (isGlobalCanvasContext(context)) {
    return context.workspaceName || context.projectName || canvasWidgetShapeT("context.global");
  }

  return context.contextScope === "project"
    ? context.projectName || canvasWidgetShapeT("context.project")
    : context.workspaceName || context.projectName || canvasWidgetShapeT("context.workspace");
}

export function buildCanvasWidgetPinKey(source: CanvasWidgetSourceRef, frameId?: string | null) {
  const context = source.context;
  const contextId = getCanvasContextId(context);
  switch (source.type) {
    case "workspace-context":
      return `workspace-context:${context.contextScope}:${contextId}:${source.sections.join(",")}`;
    case "files":
      return `files:${context.contextScope}:${contextId}:${source.rootPath}`;
    case "changes":
      return `changes:${context.contextScope}:${contextId}:${source.group ?? "all"}`;
    case "review":
      return `review:${context.contextScope}:${contextId}:${source.sessionGuid ?? "current"}:${source.revisionGuid ?? "current"}`;
    case "pull-requests":
      return `pull-requests:${context.contextScope}:${contextId}`;
    case "actions":
      return `actions:${context.contextScope}:${contextId}`;
    case "center":
      return `center:${context.contextScope}:${contextId}:${frameId ?? "unframed"}`;
    case "browser":
      return `browser:${source.browserId || context.contextScope}:${contextId || "global"}`;
    case "agent-status":
      if (isGlobalCanvasContext(context)) {
        return "agent-status:global";
      }
      return `agent-status:${context.contextScope}:${contextId}`;
    case "ai-quota-usage":
      if (isGlobalCanvasContext(context)) {
        return "ai-quota-usage:global";
      }
      return `ai-quota-usage:${context.contextScope}:${contextId}`;
    case "agent-chat":
      // One pin key per widget instance (not shared across all agent-chat cards).
      return `agent-chat:${source.instanceId ?? `${context.contextScope}:${contextId || "global"}`}`;
  }
}

export function createCanvasWidgetTitle(source: CanvasWidgetSourceRef): string {
  switch (source.type) {
    case "workspace-context":
      return canvasWidgetShapeT("titles.workspaceContext");
    case "files":
      return canvasWidgetShapeT("titles.files");
    case "changes":
      return canvasWidgetShapeT("titles.changes");
    case "review":
      return canvasWidgetShapeT("titles.review");
    case "pull-requests":
      return canvasWidgetShapeT("titles.pullRequests");
    case "actions":
      return canvasWidgetShapeT("titles.actions");
    case "center":
      return canvasWidgetShapeT("titles.center");
    case "browser":
      return canvasWidgetShapeT("titles.browser");
    case "agent-status":
      return canvasWidgetShapeT("titles.agentStatus");
    case "ai-quota-usage":
      return canvasWidgetShapeT("titles.aiQuotaUsage");
    case "agent-chat":
      return canvasWidgetShapeT("titles.agentChat");
  }
}

export function createCanvasWidgetShapeProps(
  props: {
    widgetType: CanvasWidgetType;
    title?: string;
    source: CanvasWidgetSourceRef;
    w?: number;
    h?: number;
    isPinned?: boolean;
    pinKey?: string;
    lastActivatedAt?: number | null;
    displayMode?: CanvasWidgetShapeProps["displayMode"];
    frameId?: string | null;
  },
): CanvasWidgetShapeProps {
  const size = CANVAS_WIDGET_DEFAULT_SIZES[props.widgetType];
  const source = sanitizeCanvasWidgetSource(props.source);
  return {
    w: props.w ?? size.w,
    h: props.h ?? size.h,
    widgetType: props.widgetType,
    title: props.title ?? createCanvasWidgetTitle(source),
    source,
    isPinned: props.isPinned ?? false,
    pinKey: props.pinKey ?? buildCanvasWidgetPinKey(source, props.frameId),
    lastActivatedAt: props.lastActivatedAt ?? null,
    displayMode: props.displayMode ?? "auto",
  };
}

function isCanvasWidgetType(value: unknown): value is CanvasWidgetType {
  return (
    value === "workspace-context" ||
    value === "files" ||
    value === "changes" ||
    value === "review" ||
    value === "pull-requests" ||
    value === "actions" ||
    value === "center" ||
    value === "browser" ||
    value === "agent-status" ||
    value === "ai-quota-usage" ||
    value === "agent-chat"
  );
}

export function isCanvasWidgetShapeRecord(
  value: unknown,
): value is CanvasWidgetShape & { typeName: "shape" } {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as { typeName?: string; type?: string; props?: unknown };
  return (
    candidate.typeName === "shape" &&
    candidate.type === CANVAS_WIDGET_SHAPE_TYPE &&
    !!candidate.props &&
    typeof candidate.props === "object"
  );
}

export function getCanvasWidgetShapes(editor: Editor): CanvasWidgetShape[] {
  return editor.getCurrentPageShapes().filter(isCanvasWidgetShapeRecord);
}

export function normalizeCanvasWidgetShapePropsInDocument(
  document: TLEditorSnapshot["document"],
): TLEditorSnapshot["document"] {
  const store = document.store as Record<string, unknown>;
  let changed = false;
  const nextStore: Record<string, unknown> = {};

  for (const [recordId, record] of Object.entries(store)) {
    if (!isCanvasWidgetShapeRecord(record)) {
      nextStore[recordId] = record;
      continue;
    }

    const rawProps = record.props as Partial<CanvasWidgetShapeProps>;
    const widgetType = isCanvasWidgetType(rawProps.widgetType)
      ? rawProps.widgetType
      : rawProps.source?.type;
    if (!isCanvasWidgetType(widgetType) || !rawProps.source) {
      nextStore[recordId] = record;
      continue;
    }

    const size = CANVAS_WIDGET_DEFAULT_SIZES[widgetType];
    const sanitizedSource = sanitizeCanvasWidgetSource(rawProps.source);
    const normalizedSource =
      sanitizedSource.type === "agent-chat"
        ? {
            ...sanitizedSource,
            instanceId: sanitizedSource.instanceId?.trim() || recordId,
          }
        : sanitizedSource;
    const rawTitle =
      typeof rawProps.title === "string" && rawProps.title.trim()
        ? rawProps.title
        : null;
    const normalizedTitle =
      rawTitle && !(widgetType === "center" && rawTitle === "Center")
        ? rawTitle
        : createCanvasWidgetTitle(normalizedSource);

    const normalizedProps: CanvasWidgetShapeProps = {
      w: typeof rawProps.w === "number" && rawProps.w > 0 ? rawProps.w : size.w,
      h: typeof rawProps.h === "number" && rawProps.h > 0 ? rawProps.h : size.h,
      widgetType,
      title: normalizedTitle,
      source: normalizedSource,
      isPinned: rawProps.isPinned ?? false,
      pinKey:
        normalizedSource.type === "agent-chat"
          ? buildCanvasWidgetPinKey(normalizedSource)
          : typeof rawProps.pinKey === "string" && rawProps.pinKey
            ? rawProps.pinKey
            : buildCanvasWidgetPinKey(normalizedSource),
      lastActivatedAt: normalizeLastActivatedAt(rawProps.lastActivatedAt),
      displayMode: normalizeDisplayMode(rawProps.displayMode),
    };

    const nextRecord = {
      ...record,
      props: normalizedProps,
    } satisfies CanvasWidgetShape;
    nextStore[recordId] = nextRecord;

    if (JSON.stringify(rawProps) !== JSON.stringify(normalizedProps)) {
      changed = true;
    }
  }

  if (!changed) {
    return document;
  }

  return {
    ...document,
    store: nextStore as TLEditorSnapshot["document"]["store"],
  };
}

export function getCanvasWidgetContext(source: CanvasWidgetSourceRef): CanvasContextRef {
  return source.context;
}

export function isCanvasCenterWidgetShape(
  shape: CanvasWidgetShape,
): shape is CanvasWidgetShape & {
  props: CanvasWidgetShapeProps & {
    widgetType: "center";
    source: Extract<CanvasWidgetSourceRef, { type: "center" }>;
  };
} {
  return shape.props.widgetType === "center" && shape.props.source.type === "center";
}

export function updateCanvasCenterWidgetTabs(
  editor: Editor,
  shapeId: TLShapeId,
  source: Extract<CanvasWidgetSourceRef, { type: "center" }>,
) {
  const sanitizedSource = sanitizeCanvasWidgetSource(source);
  editor.updateShape({
    id: shapeId,
    type: CANVAS_WIDGET_SHAPE_TYPE,
    props: {
      source: sanitizedSource,
      lastActivatedAt: Date.now(),
    },
  });
}
