"use client";

import {
  BaseBoxShapeUtil,
  T,
  createTLStore,
  createShapeId,
  defaultBindingUtils,
  defaultShapeUtils,
  type TLEditorSnapshot,
  type TLPage,
  type TLPageId,
  type TLShape,
} from "tldraw";
import type { IndexKey } from "@tldraw/utils";
import type { TerminalContextScope } from "@/api/rest-api";

export const CANVAS_TERMINAL_SHAPE_TYPE = "canvas-terminal" as const;
export const CANVAS_TERMINAL_PIN_STATE_EVENT = "canvas-terminal-pin-state-change";
const DEFAULT_PAGE_ID = "page:page";
const DEFAULT_PAGE_NAME = "Page 1";
const SESSION_SNAPSHOT_VERSION = 0;

export type CanvasTerminalShapeProps = {
  w: number;
  h: number;
  contextScope: TerminalContextScope;
  workspaceId: string;
  projectName: string;
  workspaceName: string;
  localPath: string;
  terminalName: string;
  tmuxWindowName: string;
  isNewTerminal: boolean;
  isPinned: boolean;
  pinKey: string;
  lastAttachedAt: number | null;
};

declare module "tldraw" {
  interface TLGlobalShapePropsMap {
    [CANVAS_TERMINAL_SHAPE_TYPE]: CanvasTerminalShapeProps;
  }
}

export type CanvasTerminalShape = TLShape<typeof CANVAS_TERMINAL_SHAPE_TYPE>;

export class CanvasTerminalShapeSchemaUtil extends BaseBoxShapeUtil<CanvasTerminalShape> {
  static override type = CANVAS_TERMINAL_SHAPE_TYPE;

  static override props = {
    w: T.number,
    h: T.number,
    contextScope: T.string,
    workspaceId: T.string,
    projectName: T.string,
    workspaceName: T.string,
    localPath: T.string,
    terminalName: T.string,
    tmuxWindowName: T.string,
    isNewTerminal: T.boolean,
    isPinned: T.boolean,
    pinKey: T.string,
    lastAttachedAt: T.nullable(T.number),
  };

  override canEdit() {
    return false;
  }

  override canScroll() {
    return true;
  }

  getDefaultProps(): CanvasTerminalShape["props"] {
    return {
      w: 720,
      h: 420,
      contextScope: "workspace",
      workspaceId: "",
      projectName: "",
      workspaceName: "",
      localPath: "",
      terminalName: "Canvas Terminal",
      tmuxWindowName: "Canvas Terminal",
      isNewTerminal: true,
      isPinned: false,
      pinKey: "",
      lastAttachedAt: null,
    };
  }

  component(shape: CanvasTerminalShape): React.JSX.Element | null {
    void shape;
    return null;
  }

  getIndicatorPath(shape: CanvasTerminalShape) {
    const path = new Path2D();
    path.rect(0, 0, shape.props.w, shape.props.h);
    return path;
  }
}

export function buildCanvasTerminalPinKey(
  contextScope: TerminalContextScope,
  workspaceId: string,
  tmuxWindowName: string,
) {
  return `${contextScope}:${workspaceId}:${tmuxWindowName}`;
}

export function createCanvasTerminalShapeProps(
  props: Omit<CanvasTerminalShapeProps, "w" | "h" | "isPinned" | "pinKey" | "lastAttachedAt"> & {
    isPinned?: boolean;
    pinKey?: string;
    lastAttachedAt?: number | null;
  },
): CanvasTerminalShapeProps {
  return {
    w: 720,
    h: 420,
    ...props,
    isPinned: props.isPinned ?? false,
    pinKey: props.pinKey ?? "",
    lastAttachedAt: props.lastAttachedAt ?? null,
  };
}

function createEmptySnapshot(): TLEditorSnapshot {
  const store = createTLStore({
    shapeUtils: [...defaultShapeUtils, CanvasTerminalShapeSchemaUtil],
    bindingUtils: defaultBindingUtils,
  });

  return {
    document: store.getStoreSnapshot(),
    session: {
      version: SESSION_SNAPSHOT_VERSION,
    },
  };
}

export function isCanvasTerminalShapeRecord(
  value: unknown,
): value is CanvasTerminalShape & {
  typeName: "shape";
} {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as { typeName?: string; type?: string };
  return candidate.typeName === "shape" && candidate.type === CANVAS_TERMINAL_SHAPE_TYPE;
}

function isPageRecord(value: unknown): value is TLPage {
  if (!value || typeof value !== "object") {
    return false;
  }

  return (value as { typeName?: string }).typeName === "page";
}

function ensurePage(snapshot: TLEditorSnapshot) {
  const store = snapshot.document.store as Record<string, unknown>;
  const pages = Object.values(store).filter(isPageRecord);

  const pageId = (snapshot.session.currentPageId ?? pages[0]?.id ?? DEFAULT_PAGE_ID) as TLPageId;

  if (!store[pageId]) {
    store[pageId] = {
      id: pageId,
      typeName: "page",
      name: DEFAULT_PAGE_NAME,
      index: "a1" as IndexKey,
      meta: {},
    } satisfies TLPage;
  }

  snapshot.session.currentPageId = pageId;
  return pageId;
}

function getNextShapeIndex(snapshot: TLEditorSnapshot) {
  const shapeCount = Object.values(snapshot.document.store).filter(
    (record) => Boolean(record) && typeof record === "object" && (record as { typeName?: string }).typeName === "shape",
  ).length;
  return `a${shapeCount + 1}` as IndexKey;
}

export function pinCanvasTerminalShapeInSnapshot(
  snapshot: TLEditorSnapshot | null,
  props: CanvasTerminalShapeProps,
) {
  const nextSnapshot = snapshot ? structuredClone(snapshot) : createEmptySnapshot();
  const store = nextSnapshot.document.store as Record<string, unknown>;

  if (props.pinKey) {
    const existingShape = Object.values(store).find(
      (record) => isCanvasTerminalShapeRecord(record) && record.props.pinKey === props.pinKey,
    ) as CanvasTerminalShape | undefined;

    if (existingShape) {
      return {
        snapshot: nextSnapshot,
        inserted: false,
        shapeId: existingShape.id,
      };
    }
  }

  const pageId = ensurePage(nextSnapshot);
  const shapeId = createShapeId();
  const offset = Object.values(store).filter(isCanvasTerminalShapeRecord).length % 8;

  store[shapeId] = {
    id: shapeId,
    typeName: "shape",
    type: CANVAS_TERMINAL_SHAPE_TYPE,
    x: 120 + offset * 44,
    y: 120 + offset * 44,
    rotation: 0,
    index: getNextShapeIndex(nextSnapshot),
    parentId: pageId,
    isLocked: false,
    opacity: 1,
    props,
    meta: {},
  } satisfies CanvasTerminalShape;

  return {
    snapshot: nextSnapshot,
    inserted: true,
    shapeId,
  };
}

export function getPinnedCanvasTerminalPinKeys(snapshot: TLEditorSnapshot | null) {
  if (!snapshot) {
    return new Set<string>();
  }

  return new Set(
    Object.values(snapshot.document.store as Record<string, unknown>)
      .filter(isCanvasTerminalShapeRecord)
      .map((record) => record.props.pinKey)
      .filter((pinKey): pinKey is string => Boolean(pinKey)),
  );
}

export function dispatchCanvasTerminalPinStateChange(pinKey: string, pinned: boolean) {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(
    new CustomEvent(CANVAS_TERMINAL_PIN_STATE_EVENT, {
      detail: { pinKey, pinned },
    }),
  );
}
