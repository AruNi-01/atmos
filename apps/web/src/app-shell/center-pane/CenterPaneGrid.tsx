"use client";

import React from "react";
import { createPortal } from "react-dom";
import {
  cn,
  DndContext,
  PointerSensor,
  getEventCoordinates,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
} from "@workspace/ui";
import {
  CENTER_STAGE_RADIUS_CLASS,
  RESIZE_HAIRLINE_CORNER_INSET_CSS,
} from "@/app-shell/sidebar-layout-constants";
import {
  normalizeCenterPaneLayout,
  type CenterPane,
  type CenterPaneLayout,
  type CenterPaneTree,
} from "@/app-shell/center-pane/center-pane-layout";
import {
  collectTerminalLayoutGeometry,
  dockLeafAtRoot,
  dockLeafInLayoutTree,
  hitDockEdge,
  terminalLayoutTopologyEqual,
  updateSplitPercentageAtPath,
  type TerminalDockEdge,
  type TerminalSplitBox,
} from "@/features/terminal/lib/terminal-layout-tree";
import {
  dragPreviewGrabOffset,
  scaleTerminalDragPreview,
} from "@/features/terminal/lib/terminal-pane-drag-preview";
import { HOST_RESIZE_DRAG_ATTR } from "@/features/terminal/lib/host-resize-pin";
import { useLiveSplitLayout } from "@/features/terminal/lib/use-live-split-layout";
import { useAnimatedPaneTiles } from "@/app-shell/center-pane/use-animated-pane-tiles";
import {
  shouldSuppressCenterPaneDockHover,
  type CenterPaneDockRect,
} from "@/app-shell/center-pane/center-pane-dock-hover";
import { buildCenterPaneLivePreview } from "@/app-shell/center-pane/center-pane-drag-preview";
import {
  centerPaneFullscreenTileStyle,
  centerPaneLeafTileStyle,
} from "@/app-shell/center-pane/center-pane-leaf-metrics";

import "./center-pane-grid.css";

export type CenterPaneGridProps = {
  layout: CenterPaneLayout;
  onFocus: (paneId: string) => void;
  onTreeChange: (tree: CenterPaneTree) => void;
  /** Tab bar + optional chrome for a pane (content slot is always appended). */
  renderPaneChrome: (pane: CenterPane, ctx: { isFocused: boolean }) => React.ReactNode;
  /** True on the render that opens the mosaic from a single pane. */
  seedFromFullPane?: boolean;
  /** Painted workspace/project id — hops snap instead of morphing the previous split. */
  contextId?: string;
  /** Focused pane that should cover sibling center regions (not the footer). */
  fullscreenPaneId?: string | null;
  className?: string;
};

type DockHover =
  | { kind: "pane"; paneId: string; edge: TerminalDockEdge }
  | { kind: "root"; edge: TerminalDockEdge };

type PaneDragPreview = {
  paneId: string;
  width: number;
  height: number;
  sourceWidth: number;
  sourceHeight: number;
  originX: number;
  originY: number;
  liveNode: HTMLElement | null;
};

type GhostPose = { x: number; y: number };

const ROOT_EDGES: TerminalDockEdge[] = ["top", "bottom", "left", "right"];

const paneCollision: CollisionDetection = (args) => {
  const pointerHits = pointerWithin(args);
  if (pointerHits.length === 0) return [];
  const rootHits = pointerHits.filter((hit) =>
    String(hit.id).startsWith("center-root-drop:"),
  );
  return rootHits.length > 0 ? rootHits : pointerHits;
};

export function CenterPaneGrid({
  layout,
  onFocus,
  onTreeChange,
  renderPaneChrome,
  seedFromFullPane = false,
  contextId = "",
  fullscreenPaneId = null,
  className,
}: CenterPaneGridProps) {
  const normalized = React.useMemo(() => normalizeCenterPaneLayout(layout), [layout]);
  const tree = normalized.tree ?? normalized.order[0] ?? normalized.panes[0]?.id ?? "pane-main";
  const { live, liveRef, beginLiveResize, publishLive, commitLiveResize } =
    useLiveSplitLayout(tree);
  const hoverRef = React.useRef<DockHover | null>(null);
  const paneById = React.useMemo(() => {
    const map = new Map<string, CenterPane>();
    for (const pane of normalized.panes) map.set(pane.id, pane);
    return map;
  }, [normalized.panes]);
  const geometry = React.useMemo(
    () => collectTerminalLayoutGeometry(live),
    [live],
  );
  const canDrag = normalized.order.length > 1;
  const isOnlyPane = normalized.order.length === 1;
  const [liveResizing, setLiveResizing] = React.useState(false);
  const paneCacheRef = React.useRef(paneById);
  paneCacheRef.current = new Map([...paneCacheRef.current, ...paneById]);
  const mosaicContextRef = React.useRef(contextId);
  const [snapMotion, setSnapMotion] = React.useState(false);
  if (mosaicContextRef.current !== contextId) {
    mosaicContextRef.current = contextId;
    if (!snapMotion) setSnapMotion(true);
  }
  React.useLayoutEffect(() => {
    if (!snapMotion) return;
    let inner = 0;
    const outer = window.requestAnimationFrame(() => {
      inner = window.requestAnimationFrame(() => setSnapMotion(false));
    });
    return () => {
      window.cancelAnimationFrame(outer);
      window.cancelAnimationFrame(inner);
    };
  }, [contextId, snapMotion]);
  const tiles = useAnimatedPaneTiles(geometry.leaves, {
    liveResizing,
    seedFromFullPane,
    contextId,
  });
  const [draggingPaneId, setDraggingPaneId] = React.useState<string | null>(null);
  const [hover, setHover] = React.useState<DockHover | null>(null);
  const [preview, setPreview] = React.useState<PaneDragPreview | null>(null);
  const [ghostPose, setGhostPose] = React.useState<GhostPose | null>(null);
  const grabOffsetRef = React.useRef({ x: 0, y: 0 });
  const sourceRectRef = React.useRef<CenterPaneDockRect | null>(null);
  const otherRectsRef = React.useRef<CenterPaneDockRect[]>([]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  const moveGhost = React.useCallback((event: {
    activatorEvent: Event;
    delta: { x: number; y: number };
  }) => {
    const pointer = pointerFromDragEvent(event);
    if (!pointer) return;
    setGhostPose({
      x: pointer.x - grabOffsetRef.current.x,
      y: pointer.y - grabOffsetRef.current.y,
    });
  }, []);

  const updateHover = React.useCallback((event: DragMoveEvent) => {
    moveGhost(event);
    const pointer = pointerFromDragEvent(event);
    if (
      shouldSuppressCenterPaneDockHover(
        pointer,
        sourceRectRef.current,
        otherRectsRef.current,
      )
    ) {
      hoverRef.current = null;
      setHover(null);
      return;
    }
    const over = event.over;
    if (!over) {
      hoverRef.current = null;
      setHover(null);
      return;
    }
    const data = over.data.current;
    if (data?.kind === "root" && isDockEdge(data.edge)) {
      const next: DockHover = { kind: "root", edge: data.edge };
      hoverRef.current = next;
      setHover(next);
      return;
    }
    const paneId = readPaneId(data);
    const sourceId = readPaneId(event.active.data.current);
    if (!paneId || paneId === sourceId) {
      hoverRef.current = null;
      setHover(null);
      return;
    }
    const edge = pointer
      ? hitDockEdge(over.rect, pointer.x, pointer.y)
      : "bottom";
    const next: DockHover = { kind: "pane", paneId, edge };
    hoverRef.current = next;
    setHover(next);
  }, [moveGhost]);

  const handleDragStart = React.useCallback((event: DragStartEvent) => {
    const paneId = readPaneId(event.active.data.current);
    if (!paneId) return;
    const el = document.querySelector(
      `[data-center-split-leaf="${CSS.escape(paneId)}"]`,
    );
    const sourceRect = el instanceof HTMLElement ? el.getBoundingClientRect() : null;
    sourceRectRef.current = sourceRect;
    otherRectsRef.current = collectOtherPaneRects(paneId);
    const rect = sourceRect ?? { width: 360, height: 240, left: 0, top: 0 };
    const sized = scaleTerminalDragPreview(rect.width, rect.height);
    const pointer = getEventCoordinates(event.activatorEvent);
    const grab = dragPreviewGrabOffset(sized.width);
    grabOffsetRef.current = grab;
    setPreview({
      paneId,
      width: sized.width,
      height: sized.height,
      sourceWidth: Math.max(1, rect.width),
      sourceHeight: Math.max(1, rect.height),
      originX: grab.x,
      originY: grab.y,
      liveNode:
        el instanceof HTMLElement ? buildCenterPaneLivePreview(el, paneId) : null,
    });
    setGhostPose(
      pointer
        ? { x: pointer.x - grab.x, y: pointer.y - grab.y }
        : { x: rect.left, y: rect.top },
    );
    setDraggingPaneId(paneId);
    hoverRef.current = null;
    setHover(null);
    setCenterPaneDragging(true);
  }, []);

  const finishDrag = React.useCallback(() => {
    hoverRef.current = null;
    sourceRectRef.current = null;
    otherRectsRef.current = [];
    setDraggingPaneId(null);
    setHover(null);
    setPreview(null);
    setGhostPose(null);
    setCenterPaneDragging(false);
  }, []);

  const handleDragEnd = React.useCallback(
    (event: DragEndEvent) => {
      const fromId = readPaneId(event.active.data.current);
      const nextHover = hoverRef.current;
      finishDrag();
      if (!fromId || !nextHover) return;
      const current = liveRef.current;
      const next =
        nextHover.kind === "root"
          ? dockLeafAtRoot(current, fromId, nextHover.edge)
          : nextHover.paneId === fromId
            ? current
            : dockLeafInLayoutTree(current, fromId, nextHover.paneId, nextHover.edge);
      if (terminalLayoutTopologyEqual(current, next)) return;
      onTreeChange(next);
    },
    [finishDrag, liveRef, onTreeChange],
  );

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={paneCollision}
      onDragStart={handleDragStart}
      onDragMove={updateHover}
      onDragOver={updateHover}
      onDragEnd={handleDragEnd}
      onDragCancel={finishDrag}
    >
      <div
        className={cn("relative h-full min-h-0 min-w-0", className)}
        data-center-pane-grid=""
        data-center-split-root=""
        data-live-resizing={liveResizing ? "" : undefined}
        data-pane-snap={snapMotion ? "" : undefined}
      >
        {tiles.map((leaf) => {
          const pane = paneById.get(leaf.id) ?? paneCacheRef.current.get(leaf.id);
          if (!pane) return null;
          const exiting = leaf.phase === "exit";
          const isPaneFullscreen = !exiting && fullscreenPaneId === leaf.id;
          return (
            <div
              key={leaf.id}
              className="center-pane-leaf absolute min-h-0 min-w-0"
              data-phase={leaf.phase}
              data-center-pane-fullscreen={isPaneFullscreen ? "" : undefined}
              style={
                isPaneFullscreen
                  ? centerPaneFullscreenTileStyle()
                  : centerPaneLeafTileStyle(leaf)
              }
            >
              <SplitLeaf
                pane={pane}
                isFocused={!exiting && normalized.focusedPaneId === pane.id}
                isOnlyPane={isOnlyPane}
                canDrag={canDrag && !exiting && !fullscreenPaneId}
                draggingPaneId={draggingPaneId}
                onFocus={onFocus}
                renderPaneChrome={renderPaneChrome}
              />
            </div>
          );
        })}
        {fullscreenPaneId
          ? null
          : geometry.splits.map((split) => (
              <SplitHandle
                key={split.path.join("/") || "root"}
                split={split}
                treeRef={liveRef}
                onLiveTree={publishLive}
                onResizeStart={() => {
                  setLiveResizing(true);
                  beginLiveResize();
                }}
                onResizeEnd={() => {
                  commitLiveResize(onTreeChange);
                  setLiveResizing(false);
                }}
              />
            ))}
        {draggingPaneId
          ? ROOT_EDGES.map((edge) => <RootEdgeDrop key={edge} edge={edge} />)
          : null}
      </div>
      {hover ? (
        <CenterPaneDockPreview
          edge={hover.edge}
          box={
            hover.kind === "root"
              ? { left: 0, top: 0, width: 1, height: 1 }
              : geometry.leaves.find((leaf) => leaf.id === hover.paneId) ?? null
          }
        />
      ) : null}
      {preview && ghostPose && typeof document !== "undefined"
        ? createPortal(
            <CenterPaneDragGhost preview={preview} pose={ghostPose} />,
            document.body,
          )
        : null}
    </DndContext>
  );
}

function SplitLeaf({
  pane,
  isFocused,
  isOnlyPane,
  canDrag,
  draggingPaneId,
  onFocus,
  renderPaneChrome,
}: {
  pane: CenterPane;
  isFocused: boolean;
  isOnlyPane: boolean;
  canDrag: boolean;
  draggingPaneId: string | null;
  onFocus: (paneId: string) => void;
  renderPaneChrome: CenterPaneGridProps["renderPaneChrome"];
}) {
  const isSource = draggingPaneId === pane.id;
  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({
    id: `center-pane-drag:${pane.id}`,
    data: { paneId: pane.id, kind: "pane" },
    disabled: !canDrag,
  });
  const { setNodeRef: setDropRef } = useDroppable({
    id: `center-pane-drop:${pane.id}`,
    data: { paneId: pane.id, kind: "pane" },
    disabled: !canDrag || isSource,
  });
  return (
      <div
        ref={setDropRef}
        data-center-pane={pane.id}
        data-center-split-leaf={pane.id}
        data-focused={isFocused ? "true" : "false"}
        className={cn(
          "relative flex h-full min-h-0 min-w-0 flex-col bg-background ring-1 transition-[box-shadow,ring-color,opacity]",
          CENTER_STAGE_RADIUS_CLASS,
          "isolate",
          isOnlyPane
            ? "ring-border/40"
            : isFocused
              ? "ring-border/70 shadow-sm"
              : "ring-border/40",
          isDragging && "pointer-events-none opacity-80",
        )}
        onPointerDownCapture={() => onFocus(pane.id)}
      >
        {canDrag ? (
          <div
            ref={setDragRef}
            data-center-pane-drag-handle=""
            className="absolute inset-x-0 top-0 z-30 h-1.5 cursor-grab touch-none active:cursor-grabbing"
            {...attributes}
            {...listeners}
          />
        ) : null}
        <div className={cn("relative z-20 flex min-h-0 flex-1 flex-col overflow-hidden", CENTER_STAGE_RADIUS_CLASS)}>
          {renderPaneChrome(pane, { isFocused })}
        </div>
      </div>
  );
}

function SplitHandle({
  split,
  treeRef,
  onLiveTree,
  onResizeStart,
  onResizeEnd,
}: {
  split: TerminalSplitBox;
  treeRef: React.MutableRefObject<CenterPaneTree>;
  onLiveTree: (tree: CenterPaneTree) => void;
  onResizeStart: () => void;
  onResizeEnd: () => void;
}) {
  const isRow = split.direction === "row";
  const startResize = React.useCallback(
    (event: React.PointerEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const handle = event.currentTarget as HTMLElement;
      const root = handle.closest("[data-center-split-root]");
      if (!(root instanceof HTMLElement)) return;
      const rootRect = root.getBoundingClientRect();
      const size = isRow
        ? split.parent.width * rootRect.width
        : split.parent.height * rootRect.height;
      if (size <= 0) return;
      const origin = isRow
        ? rootRect.left + split.parent.left * rootRect.width
        : rootRect.top + split.parent.top * rootRect.height;
      handle.setAttribute("data-resizing", "");
      onResizeStart();

      const onMove = (ev: PointerEvent) => {
        const pos = isRow ? ev.clientX : ev.clientY;
        const nextPct = ((pos - origin) / size) * 100;
        onLiveTree(
          updateSplitPercentageAtPath(treeRef.current, split.path, nextPct),
        );
      };
      const onUp = () => {
        handle.removeAttribute("data-resizing");
        onResizeEnd();
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [isRow, onLiveTree, onResizeEnd, onResizeStart, split, treeRef],
  );

  return (
    <div
      role="separator"
      aria-orientation={isRow ? "vertical" : "horizontal"}
      className={cn(
        "group absolute z-20 touch-none",
        isRow
          ? "w-2 -ml-1 cursor-col-resize"
          : "h-2 -mt-1 cursor-row-resize",
      )}
      style={
        isRow
          ? {
              left: `${split.left * 100}%`,
              top: `${split.top * 100}%`,
              height: `${split.height * 100}%`,
            }
          : {
              left: `${split.left * 100}%`,
              top: `${split.top * 100}%`,
              width: `${split.width * 100}%`,
            }
      }
      onPointerDown={startResize}
    >
      <CenterPaneResizeHairline orientation={isRow ? "vertical" : "horizontal"} />
    </div>
  );
}

function CenterPaneResizeHairline({
  orientation,
}: {
  orientation: "vertical" | "horizontal";
}) {
  const vertical = orientation === "vertical";
  return (
    <span
      aria-hidden
      data-resize-hairline={orientation}
      className={cn(
        "pointer-events-none absolute bg-transparent",
        "group-hover:bg-border/50 group-data-[resizing]:bg-border/50",
        vertical
          ? "left-1/2 w-px -translate-x-1/2"
          : "top-1/2 h-px -translate-y-1/2",
      )}
      style={
        vertical
          ? {
              top: RESIZE_HAIRLINE_CORNER_INSET_CSS,
              bottom: RESIZE_HAIRLINE_CORNER_INSET_CSS,
            }
          : {
              left: RESIZE_HAIRLINE_CORNER_INSET_CSS,
              right: RESIZE_HAIRLINE_CORNER_INSET_CSS,
            }
      }
    />
  );
}

function RootEdgeDrop({ edge }: { edge: TerminalDockEdge }) {
  const { setNodeRef } = useDroppable({
    id: `center-root-drop:${edge}`,
    data: { kind: "root", edge },
  });
  return (
    <div
      ref={setNodeRef}
      data-center-root-drop={edge}
      className={cn(
        "absolute z-30",
        edge === "top" && "inset-x-0 top-0 h-4",
        edge === "bottom" && "inset-x-0 bottom-0 h-4",
        edge === "left" && "inset-y-0 left-0 w-4",
        edge === "right" && "inset-y-0 right-0 w-4",
      )}
    />
  );
}

function CenterPaneDragGhost({
  preview,
  pose,
}: {
  preview: PaneDragPreview;
  pose: GhostPose;
}) {
  const [spawned, setSpawned] = React.useState(false);
  React.useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => setSpawned(true));
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);
  const attachLive = React.useCallback(
    (node: HTMLDivElement | null) => {
      if (!node || !preview.liveNode) return;
      if (preview.liveNode.parentElement !== node) {
        node.replaceChildren(preview.liveNode);
      }
    },
    [preview.liveNode],
  );
  const scale = preview.width / Math.max(1, preview.sourceWidth);
  return (
    <div
      className={cn("center-pane-drag-ghost", spawned && "is-spawned")}
      style={{
        top: pose.y,
        left: pose.x,
        width: preview.width,
        height: preview.height,
        transformOrigin: `${preview.originX}px ${preview.originY}px`,
      }}
    >
      {preview.liveNode ? (
        <div className="center-pane-drag-ghost-live-clip">
          <div
            ref={attachLive}
            className="center-pane-drag-ghost-live"
            style={{
              width: preview.sourceWidth,
              height: preview.sourceHeight,
              transform: `scale(${scale})`,
            }}
          />
        </div>
      ) : (
        <div className="center-pane-drag-ghost-body" />
      )}
    </div>
  );
}

function setCenterPaneDragging(active: boolean) {
  const root = document.documentElement;
  const card = document.querySelector("[data-center-stage-card]");
  if (active) {
    root.setAttribute(HOST_RESIZE_DRAG_ATTR, "");
    card?.setAttribute("data-center-pane-dragging", "");
    return;
  }
  root.removeAttribute(HOST_RESIZE_DRAG_ATTR);
  card?.removeAttribute("data-center-pane-dragging");
}

function CenterPaneDockPreview({
  edge,
  box,
}: {
  edge: TerminalDockEdge;
  box: { left: number; top: number; width: number; height: number } | null;
}) {
  const [card, setCard] = React.useState<Element | null>(null);
  React.useLayoutEffect(() => {
    setCard(document.querySelector("[data-center-stage-card]"));
  }, []);
  if (!card || !box || typeof document === "undefined") return null;
  return createPortal(
    <div
      className="center-pane-dock-preview"
      data-edge={edge}
      style={centerPaneLeafTileStyle(box)}
    />,
    card,
  );
}

function collectOtherPaneRects(sourcePaneId: string): CenterPaneDockRect[] {
  const nodes = document.querySelectorAll("[data-center-split-leaf]");
  const rects: CenterPaneDockRect[] = [];
  for (const node of nodes) {
    if (!(node instanceof HTMLElement)) continue;
    if (node.getAttribute("data-center-split-leaf") === sourcePaneId) continue;
    rects.push(node.getBoundingClientRect());
  }
  return rects;
}

function readPaneId(data: Record<string, unknown> | undefined): string | null {
  const paneId = data?.paneId;
  return typeof paneId === "string" && paneId.length > 0 ? paneId : null;
}

function isDockEdge(value: unknown): value is TerminalDockEdge {
  return value === "left" || value === "right" || value === "top" || value === "bottom";
}

function pointerFromDragEvent(event: {
  activatorEvent: Event;
  delta: { x: number; y: number };
}): { x: number; y: number } | null {
  const start = getEventCoordinates(event.activatorEvent);
  if (!start) return null;
  return { x: start.x + event.delta.x, y: start.y + event.delta.y };
}

/** Content mount point for a pane — panels portal here when multi-pane. */
export function CenterPaneContentSlot({
  paneId,
  className,
}: {
  paneId: string;
  className?: string;
}) {
  return (
    <div
      data-center-pane-content-slot={paneId}
      className={cn("relative min-h-0 min-w-0 flex-1 overflow-hidden", className)}
    />
  );
}
