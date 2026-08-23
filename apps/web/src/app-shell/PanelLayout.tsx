"use client";

import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  Panel,
  PanelGroup,
  PanelResizeHandle,
  ImperativePanelHandle,
  ImperativePanelGroupHandle,
} from "@workspace/ui";
import { cn } from "@/shared/lib/utils";
import { useAppStorage } from "@atmos/shared";
import { useContextParams } from "@/shared/hooks/use-context-params";
import { useCenterPaintContextId } from "@/app-shell/center-space/use-center-paint-context-id";
import { useSidebarLayout } from "@/app-shell/SidebarLayoutContext";
import { logSidebarLayout } from "@/app-shell/sidebar-layout-debug";
import {
  getSidebarPeekOverlayWidthPx,
  SidebarPeekShell,
} from "@/app-shell/SidebarPeekShell";
import {
  DEFAULT_LEFT_SIDEBAR_SIZE,
  ROOT_RESIZE_HAIRLINE_BOTTOM_CSS,
  ROOT_RESIZE_HAIRLINE_TOP_CSS,
  ROOT_SIDEBAR_LAYOUT_AUTO_SAVE_ID,
} from "@/app-shell/sidebar-layout-constants";
import { NewWorkspaceWelcomeOverlay } from "@/app-shell/NewWorkspaceWelcomeOverlay";
import { ensureBrowserAgentTabListener } from "@/features/browser/hooks/use-browser-agent-tab-bridge";
import { registerBrowserHostChrome } from "@/features/browser/lib/ensure-browser-surface";

interface PanelLayoutProps {
  leftSidebar: React.ReactNode;
  centerStage: React.ReactNode;
}

export function PanelLayout({
  leftSidebar,
  centerStage,
}: PanelLayoutProps) {
  const storage = useAppStorage();
  const { currentView, effectiveContextId } = useContextParams();
  const paintContextId = useCenterPaintContextId();
  const layoutRootRef = useRef<HTMLDivElement>(null);
  const panelGroupRef = useRef<ImperativePanelGroupHandle>(null);
  const leftPanelRef = useRef<ImperativePanelHandle>(null);
  const {
    isLeftCollapsed,
    leftSidebarSize,
    requestedLeftSidebarSize,
    setIsLeftCollapsed,
    setLeftSidebarSize,
    setLiveLeftSidebarSize,
    setIsLeftSidebarDragging,
    setRequestedLeftSidebarSize,
    setToggleLeftSidebar,
  } = useSidebarLayout();
  const [isDragging, setIsDragging] = useState(false);
  useEffect(() => {
    void ensureBrowserAgentTabListener();
  }, []);
  useEffect(() => {
    return () => {
      document.documentElement.removeAttribute("data-atmos-drag-active");
    };
  }, []);
  useEffect(() => {
    registerBrowserHostChrome({
      currentContextId: () => paintContextId || effectiveContextId,
    });
  }, [effectiveContextId, paintContextId]);
  const [layoutRootWidth, setLayoutRootWidth] = useState(0);
  const [leftOverlaySize, setLeftOverlaySize] = useState(
    leftSidebarSize > 0 ? leftSidebarSize : DEFAULT_LEFT_SIDEBAR_SIZE,
  );
  const isDividerDraggingRef = useRef(false);
  const pendingLeftSidebarSizeRef = useRef<number | null>(null);

  useEffect(() => {
    const node = layoutRootRef.current;
    if (!node) return;

    const updateWidth = () => {
      setLayoutRootWidth(node.getBoundingClientRect().width);
    };

    updateWidth();
    const resizeObserver = new ResizeObserver(updateWidth);
    resizeObserver.observe(node);
    return () => resizeObserver.disconnect();
  }, []);

  React.useEffect(() => {
    logSidebarLayout("ROOT_VIEW_STATE", "PanelLayout view changed", {
      currentView,
      leftSidebarSize,
      isLeftCollapsed,
    });
  }, [currentView, isLeftCollapsed, leftSidebarSize]);

  React.useEffect(() => {
    setToggleLeftSidebar(() => {
      if (isLeftCollapsed) {
        leftPanelRef.current?.expand();
      } else {
        leftPanelRef.current?.collapse();
      }
    });
    return () => setToggleLeftSidebar(null);
  }, [isLeftCollapsed, setToggleLeftSidebar]);

  React.useEffect(() => {
    if (requestedLeftSidebarSize == null) {
      return;
    }

    const group = panelGroupRef.current;
    const layout = group?.getLayout();
    const clampedSize = Math.min(50, Math.max(10, requestedLeftSidebarSize));

    logSidebarLayout("ROOT_REQUESTED_RESIZE", "Requested left sidebar resize", {
      requestedLeftSidebarSize,
      clampedSize,
      currentLeftSidebarSize: leftSidebarSize,
      currentLayout: layout,
    });

    if (!group || !layout || layout.length < 2) {
      return;
    }

    if (Math.abs(clampedSize - leftSidebarSize) < 0.5) {
      setRequestedLeftSidebarSize(null);
      return;
    }

    logSidebarLayout("ROOT_SET_LAYOUT", "Applying two-panel root layout", {
      nextLayout: [clampedSize, 100 - clampedSize],
    });
    group.setLayout([clampedSize, 100 - clampedSize]);
    setRequestedLeftSidebarSize(null);
  }, [
    leftSidebarSize,
    requestedLeftSidebarSize,
    setRequestedLeftSidebarSize,
  ]);

  const handleDividerDragging = useCallback(
    (dragging: boolean) => {
      logSidebarLayout("ROOT_DIVIDER_DRAG", "Root divider drag state changed", {
        dragging,
        pendingLeftSidebarSize: pendingLeftSidebarSizeRef.current,
      });
      isDividerDraggingRef.current = dragging;
      setIsDragging(dragging);
      setIsLeftSidebarDragging(dragging);
      // Cross-origin guests (simulator iframe, desktop webview) swallow
      // pointermove. Mark the host so they can set pointer-events: none.
      if (dragging) {
        document.documentElement.setAttribute("data-atmos-drag-active", "");
      } else {
        document.documentElement.removeAttribute("data-atmos-drag-active");
      }
      if (!dragging) {
        const pending = pendingLeftSidebarSizeRef.current;
        if (pending != null) {
          pendingLeftSidebarSizeRef.current = null;
          setLeftSidebarSize(pending);
        }
      }
    },
    [setLeftSidebarSize, setIsLeftSidebarDragging],
  );

  const handleLeftPanelResize = useCallback(
    (size: number) => {
      logSidebarLayout("ROOT_LEFT_RESIZE", "Root left panel resized", {
        size,
        dragging: isDividerDraggingRef.current,
      });
      if (size > 0.5) {
        setLeftOverlaySize(size);
        setLiveLeftSidebarSize(size);
      }
      if (isDividerDraggingRef.current) {
        pendingLeftSidebarSizeRef.current = size;
        return;
      }
      setLeftSidebarSize(size);
    },
    [setLeftSidebarSize, setLiveLeftSidebarSize],
  );

  const handleRootLayout = useCallback(
    (layout: number[]) => {
      const nextLeftSize = layout[0];
      logSidebarLayout("ROOT_ON_LAYOUT", "Root PanelGroup layout emitted", {
        layout,
        nextLeftSize,
        dragging: isDividerDraggingRef.current,
      });
      if (typeof nextLeftSize !== "number" || !Number.isFinite(nextLeftSize)) {
        return;
      }

      if (nextLeftSize > 0.5) {
        setLeftOverlaySize(nextLeftSize);
        setLiveLeftSidebarSize(nextLeftSize);
      }
      if (isDividerDraggingRef.current) {
        pendingLeftSidebarSizeRef.current = nextLeftSize;
        return;
      }
      setLeftSidebarSize(nextLeftSize);
    },
    [setLeftSidebarSize, setLiveLeftSidebarSize],
  );

  const leftOverlayWidthPx = getSidebarPeekOverlayWidthPx(
    layoutRootWidth,
    leftOverlaySize,
  );

  return (
    <div
      ref={layoutRootRef}
      data-app-shell-panel-layout=""
      className="relative flex min-h-0 flex-1 overflow-hidden bg-sidebar"
    >
      <PanelGroup
        ref={panelGroupRef}
        autoSaveId={ROOT_SIDEBAR_LAYOUT_AUTO_SAVE_ID}
        direction="horizontal"
        onLayout={handleRootLayout}
        storage={storage}
        className="flex-1 bg-sidebar"
      >
        <Panel
          id="root-left-sidebar"
          order={1}
          ref={leftPanelRef}
          collapsible
          defaultSize={DEFAULT_LEFT_SIDEBAR_SIZE}
          minSize={10}
          maxSize={50}
          collapsedSize={0}
          onResize={handleLeftPanelResize}
          onCollapse={() => {
            logSidebarLayout("ROOT_LEFT_COLLAPSE", "Root left panel collapsed", {
              previousLeftSidebarSize: leftSidebarSize,
            });
            setIsLeftCollapsed(true);
            setLeftSidebarSize(0);
            setLiveLeftSidebarSize(0);
          }}
          onExpand={() => {
            logSidebarLayout("ROOT_LEFT_EXPAND", "Root left panel expanded", {
              currentLeftSidebarSize: leftSidebarSize,
            });
            setIsLeftCollapsed(false);
          }}
          className={cn(
            "h-full flex flex-col",
            !isLeftCollapsed && "[contain:layout_paint]",
            !isDragging && "transition-[flex-grow,flex-shrink,basis] duration-300 ease-in-out",
            isLeftCollapsed && "min-w-0!"
          )}
        >
          <SidebarPeekShell
            side="left"
            collapsed={isLeftCollapsed}
            widthPx={leftOverlayWidthPx}
          >
            {leftSidebar}
          </SidebarPeekShell>
        </Panel>

        <ResizeHandle
          onDragging={handleDividerDragging}
          hitAreaMargins={{ fine: 2, coarse: 4 }}
          hideHairline={isLeftCollapsed}
        />

        <Panel
          id="root-center-stage"
          order={2}
          defaultSize={100 - DEFAULT_LEFT_SIDEBAR_SIZE}
          minSize={25}
          /* Do not add contain:layout/paint here. It becomes the containing
             block for position:fixed, so Excalidraw laser/eraser trails and
             other viewport-fixed overlays shift right by the sidebar width. */
          className="relative h-full"
        >
          {centerStage}
        </Panel>
      </PanelGroup>

      <NewWorkspaceWelcomeOverlay />
    </div>
  );
}

interface ResizeHandleProps {
  onDragging: (isDragging: boolean) => void;
  className?: string;
  hideHairline?: boolean;
  hitAreaMargins?: {
    fine: number;
    coarse: number;
  };
}

function ResizeHandle({
  onDragging,
  className,
  hideHairline = false,
  hitAreaMargins,
}: ResizeHandleProps) {
  const [dragging, setDragging] = useState(false);
  return (
    <PanelResizeHandle
      onDragging={(nextDragging) => {
        setDragging(nextDragging);
        onDragging(nextDragging);
      }}
      hitAreaMargins={hitAreaMargins}
      className={cn(
        // Hit target stays full height; the painted hairline is inset so it
        // does not run through the center card corners or into the footer.
        "relative z-20 flex w-px items-center justify-center bg-transparent group touch-none",
        className
      )}
    >
      <span aria-hidden className="absolute inset-y-0 -left-1 -right-1.5" />
      {hideHairline ? null : (
        <span
          aria-hidden
          data-resize-hairline="root"
          className={cn(
            "pointer-events-none absolute left-0 w-px",
            dragging ? "bg-border/50" : "bg-transparent group-hover:bg-border/50",
          )}
          style={{
            top: ROOT_RESIZE_HAIRLINE_TOP_CSS,
            bottom: ROOT_RESIZE_HAIRLINE_BOTTOM_CSS,
          }}
        />
      )}
    </PanelResizeHandle>
  );
}
