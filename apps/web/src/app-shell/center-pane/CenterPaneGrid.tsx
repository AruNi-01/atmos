"use client";

import React from "react";
import { cn } from "@/shared/lib/utils";
import { CENTER_STAGE_RADIUS_CLASS } from "@/app-shell/sidebar-layout-constants";
import {
  gridTemplateStyles,
  type CenterPane,
  type CenterPaneLayout,
} from "@/app-shell/center-pane/center-pane-layout";

export type CenterPaneGridProps = {
  layout: CenterPaneLayout;
  onReorder: (fromIndex: number, toIndex: number) => void;
  onFocus: (paneId: string) => void;
  onClosePane?: (paneId: string) => void;
  onResizeColumns?: (boundaryIndex: number, deltaFraction: number) => void;
  onResizeRows?: (boundaryIndex: number, deltaFraction: number) => void;
  /** Tab bar + optional chrome for a pane (content slot is always appended). */
  renderPaneChrome: (pane: CenterPane, ctx: { isFocused: boolean }) => React.ReactNode;
  className?: string;
};

export function CenterPaneGrid({
  layout,
  onFocus,
  onResizeColumns,
  onResizeRows,
  renderPaneChrome,
  className,
}: CenterPaneGridProps) {
  const gridRef = React.useRef<HTMLDivElement>(null);

  const templates = gridTemplateStyles(layout);
  const paneById = React.useMemo(() => {
    const map = new Map<string, CenterPane>();
    for (const pane of layout.panes) map.set(pane.id, pane);
    return map;
  }, [layout.panes]);

  const multi = layout.order.length > 1;

  const startColumnResize = React.useCallback(
    (boundaryIndex: number, event: React.PointerEvent) => {
      if (!onResizeColumns || !gridRef.current) return;
      event.preventDefault();
      event.stopPropagation();
      const grid = gridRef.current;
      const width = grid.getBoundingClientRect().width;
      if (width <= 0) return;
      const startX = event.clientX;
      document.documentElement.setAttribute("data-atmos-drag-active", "");

      const onMove = (ev: PointerEvent) => {
        const dx = ev.clientX - startX;
        const delta = dx / width;
        // Apply relative to drag start by re-reading is awkward; use small step from last.
        // Store last X on the handler.
        const lastX = (onMove as unknown as { _lastX?: number })._lastX ?? startX;
        const step = (ev.clientX - lastX) / width;
        (onMove as unknown as { _lastX?: number })._lastX = ev.clientX;
        if (Math.abs(step) < 0.0005) return;
        onResizeColumns(boundaryIndex, step);
      };
      (onMove as unknown as { _lastX?: number })._lastX = startX;

      const onUp = () => {
        document.documentElement.removeAttribute("data-atmos-drag-active");
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [onResizeColumns],
  );

  const startRowResize = React.useCallback(
    (boundaryIndex: number, event: React.PointerEvent) => {
      if (!onResizeRows || !gridRef.current) return;
      event.preventDefault();
      event.stopPropagation();
      const grid = gridRef.current;
      const height = grid.getBoundingClientRect().height;
      if (height <= 0) return;
      const startY = event.clientY;
      document.documentElement.setAttribute("data-atmos-drag-active", "");

      const onMove = (ev: PointerEvent) => {
        const lastY = (onMove as unknown as { _lastY?: number })._lastY ?? startY;
        const step = (ev.clientY - lastY) / height;
        (onMove as unknown as { _lastY?: number })._lastY = ev.clientY;
        if (Math.abs(step) < 0.0005) return;
        onResizeRows(boundaryIndex, step);
      };
      (onMove as unknown as { _lastY?: number })._lastY = startY;

      const onUp = () => {
        document.documentElement.removeAttribute("data-atmos-drag-active");
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [onResizeRows],
  );

  return (
    <div className={cn("relative h-full min-h-0 min-w-0", className)}>
      <div
        ref={gridRef}
        className="grid h-full min-h-0 min-w-0 gap-2"
        style={templates}
        data-center-pane-grid=""
      >
        {layout.order.map((paneId) => {
          const pane = paneById.get(paneId);
          if (!pane) return null;
          const isFocused = layout.focusedPaneId === paneId;
          return (
            <div
              key={paneId}
              data-center-pane={pane.id}
              data-focused={isFocused ? "true" : "false"}
              className={cn(
                "flex min-h-0 min-w-0 flex-col overflow-hidden bg-background ring-1 transition-[box-shadow,ring-color]",
                CENTER_STAGE_RADIUS_CLASS,
                // Clip children to the rounded card so pane corners always show.
                "isolate",
                isFocused ? "ring-border/70 shadow-sm" : "ring-border/40",
              )}
              onPointerDownCapture={() => onFocus(paneId)}
            >
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                {renderPaneChrome(pane, { isFocused })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Column resize handles */}
      {multi && onResizeColumns && layout.columnCount > 1
        ? Array.from({ length: layout.columnCount - 1 }, (_, i) => {
            const leftFr = layout.columnFractions
              .slice(0, i + 1)
              .reduce((a, b) => a + b, 0);
            return (
              <div
                key={`col-resize-${i}`}
                role="separator"
                aria-orientation="vertical"
                className="absolute top-0 bottom-0 z-20 w-2 -ml-1 cursor-col-resize touch-none"
                style={{ left: `calc(${leftFr * 100}% + ${(i + 0.5) * 0.25}rem)` }}
                onPointerDown={(e) => startColumnResize(i, e)}
              />
            );
          })
        : null}

      {/* Row resize handles */}
      {multi && onResizeRows && layout.rowFractions.length > 1
        ? Array.from({ length: layout.rowFractions.length - 1 }, (_, i) => {
            const topFr = layout.rowFractions.slice(0, i + 1).reduce((a, b) => a + b, 0);
            return (
              <div
                key={`row-resize-${i}`}
                role="separator"
                aria-orientation="horizontal"
                className="absolute left-0 right-0 z-20 h-2 -mt-1 cursor-row-resize touch-none"
                style={{ top: `calc(${topFr * 100}% + ${(i + 0.5) * 0.25}rem)` }}
                onPointerDown={(e) => startRowResize(i, e)}
              />
            );
          })
        : null}
    </div>
  );
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
