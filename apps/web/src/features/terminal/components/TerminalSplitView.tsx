"use client";

import React from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
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
  collectTerminalLayoutGeometry,
  dockLeafAtRoot,
  dockLeafInLayoutTree,
  getLeaves,
  hitDockEdge,
  terminalLayoutTopologyEqual,
  updateSplitPercentageAtPath,
  type TerminalDockEdge,
  type TerminalLayoutNode,
  type TerminalSplitBox,
} from "@/features/terminal/lib/terminal-layout-tree";
import {
  dragPreviewGrabOffset,
  scaleTerminalDragPreview,
} from "@/features/terminal/lib/terminal-pane-drag-preview";
import { TerminalPaneDragHandleProvider } from "./terminal-pane-dnd";

type TerminalSplitViewProps = {
  layout: TerminalLayoutNode<string>;
  maximizedId?: string | null;
  renderPane: (paneId: string) => React.ReactNode;
  onLayoutChange: (next: TerminalLayoutNode<string>) => void;
  onResizeDragChange?: (dragging: boolean) => void;
  capturePane?: (paneId: string, width: number, height: number) => string | null;
  className?: string;
};

type DockHover =
  | { kind: "pane"; paneId: string; edge: TerminalDockEdge }
  | { kind: "root"; edge: TerminalDockEdge };

type PaneDragPreview = {
  paneId: string;
  width: number;
  height: number;
  title: string;
  toolbarHtml: string;
  snapshotUrl: string | null;
  originX: number;
  originY: number;
};

type GhostPose = {
  x: number;
  y: number;
};

const ROOT_EDGES: TerminalDockEdge[] = ["top", "bottom", "left", "right"];

const paneCollision: CollisionDetection = (args) => {
  const pointerHits = pointerWithin(args);
  if (pointerHits.length === 0) return [];
  const rootHits = pointerHits.filter((hit) =>
    String(hit.id).startsWith("root-drop:"),
  );
  return rootHits.length > 0 ? rootHits : pointerHits;
};

/**
 * Binary split tree renderer for terminal panes.
 * Resize on the divider; title-handle drag docks mosaic-style onto an edge.
 */
export function TerminalSplitView({
  layout,
  maximizedId,
  renderPane,
  onLayoutChange,
  onResizeDragChange,
  capturePane,
  className,
}: TerminalSplitViewProps) {
  const t = useTranslations("terminal.workspacePane");
  const layoutRef = React.useRef(layout);
  const hoverRef = React.useRef<DockHover | null>(null);
  const leafCount = React.useMemo(() => getLeaves(layout).length, [layout]);
  const geometry = React.useMemo(
    () => collectTerminalLayoutGeometry(layout),
    [layout],
  );
  const canDrag = !maximizedId && leafCount > 1;
  const [draggingPaneId, setDraggingPaneId] = React.useState<string | null>(null);
  const [hover, setHover] = React.useState<DockHover | null>(null);
  const [preview, setPreview] = React.useState<PaneDragPreview | null>(null);
  const [ghostPose, setGhostPose] = React.useState<GhostPose | null>(null);
  const grabOffsetRef = React.useRef({ x: 0, y: 0 });

  React.useEffect(() => {
    layoutRef.current = layout;
  }, [layout]);

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
    const pointer = pointerFromDragEvent(event);
    const edge = pointer
      ? hitDockEdge(over.rect, pointer.x, pointer.y)
      : "bottom";
    const next: DockHover = { kind: "pane", paneId, edge };
    hoverRef.current = next;
    setHover(next);
  }, [moveGhost]);

  const handleDragStart = React.useCallback(
    (event: DragStartEvent) => {
      const paneId = readPaneId(event.active.data.current);
      if (!paneId) return;
      const el = document.querySelector(
        `[data-terminal-split-leaf="${CSS.escape(paneId)}"]`,
      );
      const captured =
        el instanceof HTMLElement
          ? capturePanePreview(el)
          : {
              width: 360,
              height: 240,
              title: "",
              toolbarHtml: "",
              snapshotUrl: null,
              left: 0,
              top: 0,
            };
      const sized = scaleTerminalDragPreview(captured.width, captured.height);
      const snapshotUrl =
        capturePane?.(paneId, sized.width, sized.height) ?? captured.snapshotUrl;
      const pointer = getEventCoordinates(event.activatorEvent);
      const grab = dragPreviewGrabOffset(sized.width);
      const originX = grab.x;
      const originY = grab.y;
      grabOffsetRef.current = grab;
      setPreview({
        paneId,
        width: sized.width,
        height: sized.height,
        title: captured.title,
        toolbarHtml: captured.toolbarHtml,
        snapshotUrl,
        originX,
        originY,
      });
      setGhostPose(
        pointer
          ? { x: pointer.x - originX, y: pointer.y - originY }
          : { x: captured.left, y: captured.top },
      );
      setDraggingPaneId(paneId);
      hoverRef.current = null;
      setHover(null);
      onResizeDragChange?.(true);
      document.documentElement.setAttribute("data-atmos-drag-active", "");
    },
    [capturePane, onResizeDragChange],
  );

  const finishDrag = React.useCallback(() => {
    hoverRef.current = null;
    setDraggingPaneId(null);
    setHover(null);
    setPreview(null);
    setGhostPose(null);
    onResizeDragChange?.(false);
    document.documentElement.removeAttribute("data-atmos-drag-active");
  }, [onResizeDragChange]);

  const handleDragEnd = React.useCallback(
    (event: DragEndEvent) => {
      const fromId = readPaneId(event.active.data.current);
      const nextHover = hoverRef.current;
      finishDrag();
      if (!fromId || !nextHover) return;
      const current = layoutRef.current;
      const next =
        nextHover.kind === "root"
          ? dockLeafAtRoot(current, fromId, nextHover.edge)
          : nextHover.paneId === fromId
            ? current
            : dockLeafInLayoutTree(
                current,
                fromId,
                nextHover.paneId,
                nextHover.edge,
              );
      if (terminalLayoutTopologyEqual(current, next)) return;
      onLayoutChange(next);
    },
    [finishDrag, onLayoutChange],
  );

  if (maximizedId) {
    return (
      <div className={cn("h-full w-full min-h-0 min-w-0", className)}>
        {renderPane(maximizedId)}
      </div>
    );
  }

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
        className={cn("relative h-full w-full min-h-0 min-w-0", className)}
        data-terminal-split-root=""
      >
        {geometry.leaves.map((leaf) => (
          <div
            key={leaf.id}
            className="absolute min-h-0 min-w-0 overflow-hidden"
            style={{
              left: `${leaf.left * 100}%`,
              top: `${leaf.top * 100}%`,
              width: `${leaf.width * 100}%`,
              height: `${leaf.height * 100}%`,
            }}
          >
            <SplitLeaf
              paneId={leaf.id}
              canDrag={canDrag}
              draggingPaneId={draggingPaneId}
              hover={hover}
              renderPane={renderPane}
            />
          </div>
        ))}
        {geometry.splits.map((split) => (
          <SplitHandle
            key={split.path.join("/") || "root"}
            split={split}
            layoutRef={layoutRef}
            onLayoutChange={onLayoutChange}
            onResizeDragChange={onResizeDragChange}
          />
        ))}
        {draggingPaneId
          ? ROOT_EDGES.map((edge) => (
              <RootEdgeDrop key={edge} edge={edge} />
            ))
          : null}
        {hover?.kind === "root" ? (
          <div className="terminal-dock-preview" data-edge={hover.edge} />
        ) : null}
      </div>
      {preview && ghostPose && typeof document !== "undefined"
        ? createPortal(
            <TerminalPaneDragGhost
              preview={preview}
              pose={ghostPose}
              fallbackTitle={t("drag.ghost")}
            />,
            document.body,
          )
        : null}
    </DndContext>
  );
}

function readPaneId(data: Record<string, unknown> | undefined): string | null {
  const paneId = data?.paneId;
  return typeof paneId === "string" && paneId.length > 0 ? paneId : null;
}

function isDockEdge(value: unknown): value is TerminalDockEdge {
  return (
    value === "left" ||
    value === "right" ||
    value === "top" ||
    value === "bottom"
  );
}

function pointerFromDragEvent(event: {
  activatorEvent: Event;
  delta: { x: number; y: number };
}): { x: number; y: number } | null {
  const start = getEventCoordinates(event.activatorEvent);
  if (!start) return null;
  return { x: start.x + event.delta.x, y: start.y + event.delta.y };
}

function capturePanePreview(el: HTMLElement): {
  width: number;
  height: number;
  title: string;
  toolbarHtml: string;
  snapshotUrl: string | null;
  left: number;
  top: number;
} {
  const rect = el.getBoundingClientRect();
  const title =
    el.querySelector(".terminal-title-primary")?.textContent?.trim() ||
    el.querySelector(".terminal-pane-title")?.textContent?.trim() ||
    "";
  const toolbar =
    el.querySelector<HTMLElement>(".terminal-pane-toolbar-left") ??
    el.querySelector<HTMLElement>(".terminal-title-row");
  return {
    width: rect.width,
    height: rect.height,
    title,
    toolbarHtml: toolbar?.innerHTML ?? "",
    snapshotUrl: captureTerminalSnapshot(el),
    left: rect.left,
    top: rect.top,
  };
}

function captureTerminalSnapshot(root: HTMLElement): string | null {
  const host =
    root.querySelector<HTMLElement>(".atmos-terminal") ??
    root.querySelector<HTMLElement>(".xterm-screen") ??
    root.querySelector<HTMLElement>(".xterm") ??
    root;
  const canvases = Array.from(host.querySelectorAll("canvas")).filter((src) => {
    return src.width >= 16 && src.height >= 16;
  });
  if (canvases.length === 0) return paintTerminalRowsSnapshot(host);

  const hostRect = host.getBoundingClientRect();
  const width = Math.max(1, Math.round(hostRect.width));
  const height = Math.max(1, Math.round(hostRect.height));
  const scale = Math.min(2, window.devicePixelRatio || 1);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return paintTerminalRowsSnapshot(host);
  ctx.scale(scale, scale);
  ctx.fillStyle = "#09090b";
  ctx.fillRect(0, 0, width, height);

  let painted = false;
  for (const src of canvases) {
    try {
      const srcRect = src.getBoundingClientRect();
      ctx.drawImage(
        src,
        srcRect.left - hostRect.left,
        srcRect.top - hostRect.top,
        Math.max(1, srcRect.width),
        Math.max(1, srcRect.height),
      );
      painted = true;
    } catch {
      // WebGL/tainted canvas — try the next layer.
    }
  }

  if (!painted || isMostlyBlankCanvas(ctx, canvas.width, canvas.height)) {
    return paintTerminalRowsSnapshot(host);
  }
  try {
    return canvas.toDataURL("image/jpeg", 0.84);
  } catch {
    return paintTerminalRowsSnapshot(host);
  }
}

function isMostlyBlankCanvas(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
): boolean {
  if (width <= 0 || height <= 0) return true;
  const samples: Array<[number, number]> = [
    [2, 2],
    [Math.floor(width / 2), Math.floor(height / 2)],
    [Math.max(0, width - 3), 2],
    [2, Math.max(0, height - 3)],
    [Math.floor(width / 4), Math.floor(height / 3)],
  ];
  try {
    for (const [x, y] of samples) {
      const pixel = ctx.getImageData(x, y, 1, 1).data;
      if ((pixel[0] ?? 0) > 20 || (pixel[1] ?? 0) > 20 || (pixel[2] ?? 0) > 20) {
        return false;
      }
    }
    const stripW = Math.min(width, 72);
    const strip = ctx.getImageData(0, Math.floor(height / 3), stripW, 1).data;
    for (let i = 0; i < strip.length; i += 4) {
      if ((strip[i] ?? 0) > 20 || (strip[i + 1] ?? 0) > 20 || (strip[i + 2] ?? 0) > 20) {
        return false;
      }
    }
  } catch {
    return false;
  }
  return true;
}

function paintTerminalRowsSnapshot(host: HTMLElement): string | null {
  const rows = host.querySelectorAll(".xterm-rows > div");
  if (rows.length === 0) return null;
  const width = 440;
  const lineHeight = 16;
  const height = Math.min(320, Math.max(lineHeight * 8, rows.length * lineHeight));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "#09090b";
  ctx.fillRect(0, 0, width, height);
  ctx.font = "12px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.fillStyle = "#d4d4d8";
  let y = 14;
  rows.forEach((row) => {
    if (y > height) return;
    const text = row.textContent ?? "";
    if (text.trim().length === 0) {
      y += lineHeight;
      return;
    }
    ctx.fillText(text.slice(0, 80), 8, y, width - 16);
    y += lineHeight;
  });
  try {
    return canvas.toDataURL("image/jpeg", 0.84);
  } catch {
    return null;
  }
}

function SplitHandle({
  split,
  layoutRef,
  onLayoutChange,
  onResizeDragChange,
}: {
  split: TerminalSplitBox;
  layoutRef: React.MutableRefObject<TerminalLayoutNode<string>>;
  onLayoutChange: (next: TerminalLayoutNode<string>) => void;
  onResizeDragChange?: (dragging: boolean) => void;
}) {
  const isRow = split.direction === "row";
  const startResize = React.useCallback(
    (event: React.PointerEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const root = (event.currentTarget as HTMLElement).closest(
        "[data-terminal-split-root]",
      );
      if (!(root instanceof HTMLElement)) return;
      const rootRect = root.getBoundingClientRect();
      const size = isRow
        ? split.parent.width * rootRect.width
        : split.parent.height * rootRect.height;
      if (size <= 0) return;
      const origin = isRow
        ? rootRect.left + split.parent.left * rootRect.width
        : rootRect.top + split.parent.top * rootRect.height;
      onResizeDragChange?.(true);
      document.documentElement.setAttribute("data-atmos-drag-active", "");

      const onMove = (ev: PointerEvent) => {
        const pos = isRow ? ev.clientX : ev.clientY;
        const nextPct = ((pos - origin) / size) * 100;
        onLayoutChange(
          updateSplitPercentageAtPath(layoutRef.current, split.path, nextPct),
        );
      };
      const onUp = () => {
        onResizeDragChange?.(false);
        document.documentElement.removeAttribute("data-atmos-drag-active");
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [isRow, layoutRef, onLayoutChange, onResizeDragChange, split],
  );

  return (
    <div
      role="separator"
      aria-orientation={isRow ? "vertical" : "horizontal"}
      className={cn(
        "absolute z-10 touch-none bg-transparent",
        isRow
          ? "w-2 -ml-1 cursor-col-resize hover:bg-border/60"
          : "h-2 -mt-1 cursor-row-resize hover:bg-border/60",
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
    />
  );
}

function SplitLeaf({
  paneId,
  canDrag,
  draggingPaneId,
  hover,
  renderPane,
}: {
  paneId: string;
  canDrag: boolean;
  draggingPaneId: string | null;
  hover: DockHover | null;
  renderPane: (paneId: string) => React.ReactNode;
}) {
  const isSource = draggingPaneId === paneId;
  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({
    id: `pane-drag:${paneId}`,
    data: { paneId, kind: "pane" },
    disabled: !canDrag,
  });
  const { setNodeRef: setDropRef } = useDroppable({
    id: `pane-drop:${paneId}`,
    data: { paneId, kind: "pane" },
    disabled: !canDrag || isSource,
  });

  const handleValue = React.useMemo(
    () => ({
      setNodeRef: setDragRef,
      listeners: canDrag ? listeners : undefined,
      attributes: canDrag ? attributes : undefined,
      isDragging,
      dragEnabled: canDrag,
    }),
    [attributes, canDrag, isDragging, listeners, setDragRef],
  );

  const showDock =
    hover?.kind === "pane" && hover.paneId === paneId && !isSource;

  return (
    <TerminalPaneDragHandleProvider value={handleValue}>
      <div
        ref={setDropRef}
        data-terminal-split-leaf={paneId}
        className={cn(
          "relative h-full w-full min-h-0 min-w-0 overflow-hidden",
          isDragging && "pointer-events-none opacity-80",
        )}
      >
        {renderPane(paneId)}
        {showDock ? (
          <div className="terminal-dock-preview" data-edge={hover.edge} />
        ) : null}
      </div>
    </TerminalPaneDragHandleProvider>
  );
}

function RootEdgeDrop({ edge }: { edge: TerminalDockEdge }) {
  const { setNodeRef } = useDroppable({
    id: `root-drop:${edge}`,
    data: { kind: "root", edge },
  });
  return (
    <div
      ref={setNodeRef}
      data-terminal-root-drop={edge}
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

function TerminalPaneDragGhost({
  preview,
  pose,
  fallbackTitle,
}: {
  preview: PaneDragPreview;
  pose: GhostPose;
  fallbackTitle: string;
}) {
  const title = preview.title || fallbackTitle;
  const [spawned, setSpawned] = React.useState(false);
  React.useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => setSpawned(true));
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);
  return (
    <div
      className={cn("terminal-pane-drag-ghost", spawned && "is-spawned")}
      style={{
        top: pose.y,
        left: pose.x,
        width: preview.width,
        height: preview.height,
        transformOrigin: `${preview.originX}px ${preview.originY}px`,
      }}
    >
      <div className="terminal-pane-drag-ghost-header">
        {preview.toolbarHtml ? (
          <div
            className="terminal-pane-toolbar-left terminal-pane-title gap-1.5"
            dangerouslySetInnerHTML={{ __html: preview.toolbarHtml }}
          />
        ) : (
          <span className="truncate">{title}</span>
        )}
      </div>
      {preview.snapshotUrl ? (
        <div
          aria-hidden
          className="terminal-pane-drag-ghost-shot"
          style={{ backgroundImage: `url("${preview.snapshotUrl}")` }}
        />
      ) : (
        <div className="terminal-pane-drag-ghost-body" />
      )}
    </div>
  );
}
