"use client";

import React from "react";
import { cn } from "@/shared/lib/utils";
import { ResizeFollowMark } from "@/app-shell/ResizeFollowMark";
import { isResizeClickGesture } from "@/app-shell/resize-click-fold";
import {
  CENTER_EXPLORER_COLLAPSE_TRANSITION_CLASS,
  CENTER_EXPLORER_COLLAPSE_TRANSITION_MS,
  CENTER_EXPLORER_DEFAULT_WIDTH,
  resolveCenterExplorerResize,
  shouldAnimateExplorerFold,
  type CenterExplorerKind,
} from "@/app-shell/center-explorer-layout";

export function CenterExplorerSidecar({
  kind,
  width,
  surfaceActive,
  collapsed,
  interactive,
  style,
  onWidthChange,
  onCollapse,
  onExpand,
  children,
}: {
  kind: CenterExplorerKind;
  width: number;
  /** Explorer surface is the active center tab (Files / file / Changes / diff). */
  surfaceActive: boolean;
  /** User fold preference for this explorer kind. */
  collapsed: boolean;
  interactive?: boolean;
  style?: React.CSSProperties;
  onWidthChange: (width: number) => void;
  onCollapse: () => void;
  onExpand: () => void;
  children: React.ReactNode;
}) {
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  /** Pointer-down gesture is active (may span collapse/expand). */
  const [isResizing, setIsResizing] = React.useState(false);
  /**
   * Live width tracking without CSS transition. Cleared on threshold
   * collapse/expand so the same width/left + inset animation as the fold
   * button can run; re-enabled once the panel is open and dragging again.
   */
  const [liveResize, setLiveResize] = React.useState(false);
  /**
   * Width/left transitions only for intentional fold/expand. Surface swaps
   * (Files↔Changes) and slot remasure must not animate as flicker.
   */
  const prevCollapsedRef = React.useRef(collapsed);
  const prevSurfaceActiveRef = React.useRef(surfaceActive);
  const collapseAnimatingRef = React.useRef(false);
  const [, setCollapseEpoch] = React.useState(0);
  const takingSpace = surfaceActive && !collapsed;
  if (
    shouldAnimateExplorerFold({
      prevCollapsed: prevCollapsedRef.current,
      nextCollapsed: collapsed,
      prevSurfaceActive: prevSurfaceActiveRef.current,
      nextSurfaceActive: surfaceActive,
    })
  ) {
    collapseAnimatingRef.current = true;
  }
  const collapseAnimating = collapseAnimatingRef.current;
  const innerWidth = width > 0 ? width : CENTER_EXPLORER_DEFAULT_WIDTH;

  const setFrameAttr = React.useCallback((name: string, on: boolean) => {
    const frame = rootRef.current?.closest("[data-workspace-frame]");
    if (!(frame instanceof HTMLElement)) return;
    if (on) {
      frame.setAttribute(name, "");
    } else {
      frame.removeAttribute(name);
    }
  }, []);

  const setFrameResizing = React.useCallback(
    (resizing: boolean) => {
      setFrameAttr("data-center-explorer-resizing", resizing);
    },
    [setFrameAttr],
  );

  const setFrameCollapsing = React.useCallback(
    (collapsing: boolean) => {
      setFrameAttr("data-center-explorer-collapsing", collapsing);
    },
    [setFrameAttr],
  );

  React.useLayoutEffect(() => {
    const animate = shouldAnimateExplorerFold({
      prevCollapsed: prevCollapsedRef.current,
      nextCollapsed: collapsed,
      prevSurfaceActive: prevSurfaceActiveRef.current,
      nextSurfaceActive: surfaceActive,
    });
    prevCollapsedRef.current = collapsed;
    prevSurfaceActiveRef.current = surfaceActive;
    if (!animate) {
      // Surface swap / no-op: snap geometry and clear any stuck fold gate.
      collapseAnimatingRef.current = false;
      setFrameCollapsing(false);
      return;
    }
    setFrameCollapsing(true);
    const timeoutId = window.setTimeout(() => {
      collapseAnimatingRef.current = false;
      setFrameCollapsing(false);
      setCollapseEpoch((epoch) => epoch + 1);
    }, CENTER_EXPLORER_COLLAPSE_TRANSITION_MS);
    return () => {
      window.clearTimeout(timeoutId);
      // If fold flips again before the timeout, still clear the frame flag
      // so inset/transition gates cannot stick.
      setFrameCollapsing(false);
    };
  }, [collapsed, setFrameCollapsing, surfaceActive]);

  React.useEffect(() => {
    return () => {
      setFrameResizing(false);
      setFrameCollapsing(false);
    };
  }, [setFrameCollapsing, setFrameResizing]);

  const stopResizeListenersRef = React.useRef<(() => void) | null>(null);

  React.useEffect(() => {
    return () => {
      stopResizeListenersRef.current?.();
      stopResizeListenersRef.current = null;
    };
  }, []);

  const beginLiveResize = React.useCallback(() => {
    setLiveResize(true);
    setFrameResizing(true);
  }, [setFrameResizing]);

  const beginThresholdTransition = React.useCallback(() => {
    // Allow sidecar + body-inset CSS transitions (fold-button path).
    setLiveResize(false);
    setFrameResizing(false);
  }, [setFrameResizing]);

  return (
    <div
      ref={rootRef}
      data-center-explorer={kind}
      data-center-explorer-open={takingSpace ? "true" : "false"}
      data-center-explorer-resizing={liveResize ? "" : undefined}
      data-center-explorer-collapsing={collapseAnimating ? "" : undefined}
      aria-hidden={!takingSpace}
      inert={!takingSpace ? true : undefined}
      className={cn(
        // Clip the list, not this frame — the resize mark must paint on the
        // approach side, including over the file surface to the left.
        // z-10 beats full-bleed light surfaces (`z-[1]`) so the list is never covered.
        "absolute z-10 flex min-h-0 overflow-visible",
        // Continuous frame on top + left + bottom (no right; flush to stage edge).
        // Soft hairline — match DiffCodeViewScaffold explorer dividers.
        // TL/BL radii come from `style` / CENTER_STAGE_RADIUS_CSS.
        takingSpace && "border border-r-0 border-border/40 bg-background",
        collapseAnimating && !liveResize && CENTER_EXPLORER_COLLAPSE_TRANSITION_CLASS,
        liveResize && "transition-none",
        !takingSpace && "pointer-events-none",
        interactive && takingSpace && "pointer-events-auto",
      )}
      style={style}
    >
      {takingSpace || isResizing ? (
        <div
          role="separator"
          aria-orientation="vertical"
          data-center-explorer-resize=""
          className="absolute inset-y-0 left-0 z-10 w-3 -translate-x-1/2 cursor-col-resize overflow-visible touch-none"
          onMouseDown={(event) => {
            event.preventDefault();
            const start = { x: event.clientX, y: event.clientY };
            const startWidth = innerWidth;
            // Local flag so the same pointer-down can collapse and reopen
            // without waiting on parent `takingSpace` to round-trip.
            let collapsedDuringDrag = !takingSpace;
            let dragStarted = false;
            const startDragChrome = () => {
              if (dragStarted) return;
              dragStarted = true;
              setIsResizing(true);
              beginLiveResize();
            };
            const endResize = () => {
              setIsResizing(false);
              setLiveResize(false);
              setFrameResizing(false);
              window.removeEventListener("mousemove", onMove);
              window.removeEventListener("mouseup", onUp);
              if (stopResizeListenersRef.current === endResize) {
                stopResizeListenersRef.current = null;
              }
            };
            stopResizeListenersRef.current?.();
            stopResizeListenersRef.current = endResize;
            const onMove = (moveEvent: MouseEvent) => {
              if (
                !dragStarted &&
                isResizeClickGesture(start, {
                  x: moveEvent.clientX,
                  y: moveEvent.clientY,
                })
              ) {
                return;
              }
              startDragChrome();
              const outcome = resolveCenterExplorerResize(
                startWidth - (moveEvent.clientX - start.x),
                { collapsed: collapsedDuringDrag },
              );
              if (outcome.action === "collapse") {
                if (!collapsedDuringDrag) {
                  collapsedDuringDrag = true;
                  beginThresholdTransition();
                  onCollapse();
                }
                return;
              }
              if (collapsedDuringDrag) {
                collapsedDuringDrag = false;
                beginThresholdTransition();
                onExpand();
                onWidthChange(outcome.width);
                return;
              }
              beginLiveResize();
              onWidthChange(outcome.width);
            };
            const onUp = (upEvent: MouseEvent) => {
              if (
                !dragStarted &&
                isResizeClickGesture(start, {
                  x: upEvent.clientX,
                  y: upEvent.clientY,
                })
              ) {
                endResize();
                onCollapse();
                return;
              }
              endResize();
            };
            window.addEventListener("mousemove", onMove);
            window.addEventListener("mouseup", onUp);
          }}
        >
          <ResizeFollowMark axis="vertical" dragging={isResizing} />
        </div>
      ) : null}
      <div
        // Fill the frame width so a collapsed/off-surface rail cannot paint the
        // 260px tree into a sibling tab (outer is overflow-visible for the mark).
        className="flex h-full min-h-0 min-w-0 w-full flex-col overflow-hidden rounded-[inherit] bg-background pl-[0.5px]"
      >
        {takingSpace || isResizing || collapseAnimating ? children : null}
      </div>
    </div>
  );
}
