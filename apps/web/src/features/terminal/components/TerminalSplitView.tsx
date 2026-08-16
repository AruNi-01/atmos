"use client";

import React from "react";
import { cn } from "@workspace/ui";
import {
  clampSplitPercentage,
  isTerminalLayoutBranch,
  updateSplitPercentageAtPath,
  type TerminalLayoutNode,
  type TerminalLayoutPath,
} from "@/features/terminal/lib/terminal-layout-tree";

type TerminalSplitViewProps = {
  layout: TerminalLayoutNode<string>;
  maximizedId?: string | null;
  renderPane: (paneId: string) => React.ReactNode;
  onLayoutChange: (next: TerminalLayoutNode<string>) => void;
  onResizeDragChange?: (dragging: boolean) => void;
  className?: string;
};

/**
 * Binary split tree renderer for terminal panes (native terminal split layout).
 * Resize via pointer drag on the divider; no MultiBackend / nested DndProvider.
 */
export function TerminalSplitView({
  layout,
  maximizedId,
  renderPane,
  onLayoutChange,
  onResizeDragChange,
  className,
}: TerminalSplitViewProps) {
  const layoutRef = React.useRef(layout);
  layoutRef.current = layout;

  if (maximizedId) {
    return (
      <div className={cn("h-full w-full min-h-0 min-w-0", className)}>
        {renderPane(maximizedId)}
      </div>
    );
  }

  return (
    <div className={cn("h-full w-full min-h-0 min-w-0", className)}>
      <SplitNode
        node={layout}
        path={[]}
        layoutRef={layoutRef}
        renderPane={renderPane}
        onLayoutChange={onLayoutChange}
        onResizeDragChange={onResizeDragChange}
      />
    </div>
  );
}

function SplitNode({
  node,
  path,
  layoutRef,
  renderPane,
  onLayoutChange,
  onResizeDragChange,
}: {
  node: TerminalLayoutNode<string>;
  path: TerminalLayoutPath;
  layoutRef: React.MutableRefObject<TerminalLayoutNode<string>>;
  renderPane: (paneId: string) => React.ReactNode;
  onLayoutChange: (next: TerminalLayoutNode<string>) => void;
  onResizeDragChange?: (dragging: boolean) => void;
}) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const isRow = isTerminalLayoutBranch(node) && node.direction === "row";

  const startResize = React.useCallback(
    (event: React.PointerEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const size = isRow ? rect.width : rect.height;
      if (size <= 0) return;
      const origin = isRow ? rect.left : rect.top;
      onResizeDragChange?.(true);
      document.documentElement.setAttribute("data-atmos-drag-active", "");

      const onMove = (ev: PointerEvent) => {
        const pos = isRow ? ev.clientX : ev.clientY;
        const nextPct = ((pos - origin) / size) * 100;
        onLayoutChange(
          updateSplitPercentageAtPath(layoutRef.current, path, nextPct),
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
    [isRow, layoutRef, onLayoutChange, onResizeDragChange, path],
  );

  if (!isTerminalLayoutBranch(node)) {
    return (
      <div className="h-full w-full min-h-0 min-w-0 overflow-hidden">
        {renderPane(node)}
      </div>
    );
  }

  const pct = clampSplitPercentage(node.splitPercentage ?? 50);

  return (
    <div
      ref={containerRef}
      className={cn(
        "flex h-full w-full min-h-0 min-w-0",
        isRow ? "flex-row" : "flex-col",
      )}
    >
      <div
        className="min-h-0 min-w-0 overflow-hidden"
        style={{ flex: `0 0 ${pct}%` }}
      >
        <SplitNode
          node={node.first}
          path={[...path, "first"]}
          layoutRef={layoutRef}
          renderPane={renderPane}
          onLayoutChange={onLayoutChange}
          onResizeDragChange={onResizeDragChange}
        />
      </div>
      <div
        role="separator"
        aria-orientation={isRow ? "vertical" : "horizontal"}
        className={cn(
          "relative z-10 shrink-0 bg-transparent",
          isRow
            ? "w-1 cursor-col-resize hover:bg-border/60"
            : "h-1 cursor-row-resize hover:bg-border/60",
        )}
        onPointerDown={startResize}
      />
      <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
        <SplitNode
          node={node.second}
          path={[...path, "second"]}
          layoutRef={layoutRef}
          renderPane={renderPane}
          onLayoutChange={onLayoutChange}
          onResizeDragChange={onResizeDragChange}
        />
      </div>
    </div>
  );
}
