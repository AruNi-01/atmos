"use client";

import {
  BaseBoxShapeUtil,
  T,
  createTLStore,
  createShapeId,
  defaultBindingUtils,
  defaultShapeUtils,
  type Editor,
  type TLEditorSnapshot,
  type TLPage,
  type TLPageId,
  type TLShape,
} from "tldraw";
import { getIndexAbove, getIndexBetween, sortByIndex, type IndexKey } from "@tldraw/utils";
import type { TerminalContextScope } from "@/api/rest-api";
import type { TerminalPaneAgent } from "@/features/terminal/types/index";

import { findCanvasTerminalPlacement } from "./canvas-terminal-placement";

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
  /** Center-stage terminal sub-tab (`terminal` or `terminal-tab-*`) this pane was pinned from; used by Source deep link. */
  sourceTerminalTabId: string;
  /** When pinned from the Terminal panel, mirrors `pane.agent` for title/icon parity after reload. */
  paneAgent?: TerminalPaneAgent;
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
    sourceTerminalTabId: T.string,
    paneAgent: T.optional(
      T.object({
        id: T.string,
        label: T.string,
        command: T.string,
        iconType: T.string,
        pipeCommand: T.optional(T.string),
      }),
    ),
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
      sourceTerminalTabId: "terminal",
      paneAgent: undefined,
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
    sourceTerminalTabId: props.sourceTerminalTabId ?? "terminal",
    paneAgent: props.paneAgent,
    isPinned: props.isPinned ?? false,
    pinKey: props.pinKey ?? "",
    lastAttachedAt: props.lastAttachedAt ?? null,
  };
}

function normalizeLastAttachedAt(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isValidIndexKey(index: unknown): index is IndexKey {
  if (typeof index !== "string" || !index.length) return false;
  try {
    const above = getIndexAbove(index as IndexKey);
    getIndexBetween(index as IndexKey, above);
    return true;
  } catch {
    return false;
  }
}

/** tldraw v5 uses fractional index keys (`a1`, `a2`, …) — not `a${shapeCount}`. */
function getTopShapeIndexOnPage(
  snapshot: TLEditorSnapshot,
  pageId: TLPageId,
): IndexKey | null {
  const store = snapshot.document.store as Record<string, unknown>;
  const onPage: { index: IndexKey }[] = [];

  for (const record of Object.values(store)) {
    if (!record || typeof record !== "object") continue;
    if ((record as { typeName?: string }).typeName !== "shape") continue;
    if ((record as { parentId?: string }).parentId !== pageId) continue;
    const index = (record as { index?: string }).index;
    if (isValidIndexKey(index)) {
      onPage.push({ index });
    }
  }

  if (onPage.length === 0) return null;
  onPage.sort(sortByIndex);
  return onPage[onPage.length - 1]!.index;
}

function getNextShapeIndex(snapshot: TLEditorSnapshot, pageId: TLPageId): IndexKey {
  const top = getTopShapeIndexOnPage(snapshot, pageId);
  return getIndexAbove(top);
}

/** Fix legacy pins that used `a40`-style invalid indices (crashes tldraw on load). */
export function repairInvalidShapeIndicesInDocument(
  document: TLEditorSnapshot["document"],
): TLEditorSnapshot["document"] {
  const store = document.store as Record<string, unknown>;
  const byPage = new Map<
    string,
    Array<{ recordId: string; record: { index?: string; parentId?: string } }>
  >();

  for (const [recordId, record] of Object.entries(store)) {
    if (!record || typeof record !== "object") continue;
    if ((record as { typeName?: string }).typeName !== "shape") continue;
    const shape = record as { index?: string; parentId?: string };
    if (!shape.parentId) continue;
    if (isValidIndexKey(shape.index)) continue;
    const list = byPage.get(shape.parentId) ?? [];
    list.push({ recordId, record: shape });
    byPage.set(shape.parentId, list);
  }

  if (byPage.size === 0) return document;

  const nextStore = { ...store };
  let changed = false;

  for (const [pageId, invalidShapes] of byPage) {
    let top: IndexKey | null = getTopShapeIndexOnPage(
      { document: { ...document, store: nextStore }, session: { version: 0 } } as TLEditorSnapshot,
      pageId as TLPageId,
    );
    for (const { recordId } of invalidShapes) {
      top = getIndexAbove(top);
      const existing = nextStore[recordId];
      if (!existing || typeof existing !== "object") continue;
      nextStore[recordId] = { ...existing, index: top };
      changed = true;
    }
  }

  if (!changed) return document;
  return { ...document, store: nextStore as TLEditorSnapshot["document"]["store"] };
}

export function normalizeCanvasTerminalShapePropsInDocument(
  document: TLEditorSnapshot["document"],
): TLEditorSnapshot["document"] {
  let doc = repairInvalidShapeIndicesInDocument(document);
  const store = doc.store as Record<string, unknown>;
  let changed = doc !== document;
  const nextStore: Record<string, unknown> = {};

  for (const [recordId, record] of Object.entries(store)) {
    if (isCanvasTerminalShapeRecord(record)) {
      const rawProps = record.props as CanvasTerminalShape["props"] & { lastAttachedAt?: unknown };
      const normalizedLastAttachedAt = normalizeLastAttachedAt(rawProps.lastAttachedAt);
      const normalizedSourceTab =
        typeof rawProps.sourceTerminalTabId === "string" && rawProps.sourceTerminalTabId.length > 0
          ? rawProps.sourceTerminalTabId
          : "terminal";

      if (
        rawProps.lastAttachedAt !== normalizedLastAttachedAt ||
        rawProps.sourceTerminalTabId !== normalizedSourceTab
      ) {
        changed = true;
        nextStore[recordId] = {
          ...record,
          props: {
            ...rawProps,
            lastAttachedAt: normalizedLastAttachedAt,
            sourceTerminalTabId: normalizedSourceTab,
          },
        } satisfies CanvasTerminalShape;
        continue;
      }
    }

    nextStore[recordId] = record;
  }

  if (!changed) {
    return doc;
  }

  return {
    ...doc,
    store: nextStore as TLEditorSnapshot["document"]["store"],
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

  const candidate = value as { typeName?: string; type?: string; props?: unknown };
  if (candidate.typeName !== "shape" || candidate.type !== CANVAS_TERMINAL_SHAPE_TYPE) {
    return false;
  }

  // Ensure props exists and is an object
  if (!candidate.props || typeof candidate.props !== "object") {
    return false;
  }

  return true;
}

export function getCanvasTerminalShapes(editor: Editor): CanvasTerminalShape[] {
  return editor.getCurrentPageShapes().filter(isCanvasTerminalShapeRecord);
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
  const { x, y } = findCanvasTerminalPlacement(nextSnapshot, pageId, {
    w: props.w,
    h: props.h,
  });

  store[shapeId] = {
    id: shapeId,
    typeName: "shape",
    type: CANVAS_TERMINAL_SHAPE_TYPE,
    x,
    y,
    rotation: 0,
    index: getNextShapeIndex(nextSnapshot, pageId),
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
