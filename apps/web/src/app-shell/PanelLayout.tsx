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
import { useSidebarLayout } from "@/app-shell/SidebarLayoutContext";
import { HostedWelcomeGate } from "@/features/welcome/components/HostedWelcomeGate";
import { logSidebarLayout } from "@/app-shell/sidebar-layout-debug";
import {
  getSidebarPeekOverlayWidthPx,
  SidebarPeekShell,
} from "@/app-shell/SidebarPeekShell";
import {
  DEFAULT_LEFT_SIDEBAR_SIZE,
  ROOT_SIDEBAR_LAYOUT_AUTO_SAVE_ID,
} from "@/app-shell/sidebar-layout-constants";
import { useWelcomeOverlayState } from "@/app-shell/use-welcome-overlay-state";

const DEFAULT_RIGHT_SIDEBAR_SIZE = 20;

interface PanelLayoutProps {
  leftSidebar: React.ReactNode;
  rightSidebar: React.ReactNode;
  centerStage: React.ReactNode;
}

export function PanelLayout({
  leftSidebar,
  rightSidebar,
  centerStage,
}: PanelLayoutProps) {
  const storage = useAppStorage();
  const { currentView } = useContextParams();
  const layoutRootRef = useRef<HTMLDivElement>(null);
  const panelGroupRef = useRef<ImperativePanelGroupHandle>(null);
  const leftPanelRef = useRef<ImperativePanelHandle>(null);
  const rightPanelRef = useRef<ImperativePanelHandle>(null);
  const showRightSidebar = currentView === "project" || currentView === "workspace";
  const {
    isLeftCollapsed,
    isRightCollapsed,
    leftSidebarSize,
    requestedLeftSidebarSize,
    setIsLeftCollapsed,
    setIsRightCollapsed,
    setLeftSidebarSize,
    setRequestedLeftSidebarSize,
    setShowRightSidebar,
    setToggleLeftSidebar,
    setToggleRightSidebar,
  } = useSidebarLayout();
  const [isDragging, setIsDragging] = useState(false);
  const [layoutRootWidth, setLayoutRootWidth] = useState(0);
  const [leftOverlaySize, setLeftOverlaySize] = useState(
    leftSidebarSize > 0 ? leftSidebarSize : DEFAULT_LEFT_SIDEBAR_SIZE,
  );
  const [rightOverlaySize, setRightOverlaySize] = useState(DEFAULT_RIGHT_SIDEBAR_SIZE);
  const isDividerDraggingRef = useRef(false);
  const pendingLeftSidebarSizeRef = useRef<number | null>(null);
  const [liveLeftSidebarSize, setLiveLeftSidebarSize] = useState(leftSidebarSize);
  const welcomeOverlay = useWelcomeOverlayState();

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
    logSidebarLayout("ROOT_VIEW_STATE", "PanelLayout view/showRightSidebar changed", {
      currentView,
      showRightSidebar,
      leftSidebarSize,
      isLeftCollapsed,
      isRightCollapsed,
    });
    setShowRightSidebar(showRightSidebar);
    if (!showRightSidebar) {
      setIsRightCollapsed(false);
    }
  }, [
    currentView,
    isLeftCollapsed,
    isRightCollapsed,
    leftSidebarSize,
    setIsRightCollapsed,
    setShowRightSidebar,
    showRightSidebar,
  ]);

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
      showRightSidebar,
    });

    if (!group || !layout || layout.length < 2) {
      return;
    }

    if (Math.abs(clampedSize - leftSidebarSize) < 0.5) {
      setRequestedLeftSidebarSize(null);
      return;
    }

    if (layout.length === 2 || !showRightSidebar) {
      logSidebarLayout("ROOT_SET_LAYOUT", "Applying two-panel root layout", {
        nextLayout: [clampedSize, 100 - clampedSize],
      });
      group.setLayout([clampedSize, 100 - clampedSize]);
      setRequestedLeftSidebarSize(null);
      return;
    }

    const [, center, right] = layout;
    const remaining = 100 - clampedSize;
    const centerRightTotal = center + right;
    const centerRatio = centerRightTotal > 0 ? center / centerRightTotal : 0.75;
    const nextCenter = remaining * centerRatio;
    const nextRight = remaining - nextCenter;

    logSidebarLayout("ROOT_SET_LAYOUT", "Applying three-panel root layout", {
      previousLayout: layout,
      nextLayout: [clampedSize, nextCenter, nextRight],
      centerRatio,
    });

    group.setLayout([clampedSize, nextCenter, nextRight]);
    setRequestedLeftSidebarSize(null);
  }, [
    leftSidebarSize,
    requestedLeftSidebarSize,
    setRequestedLeftSidebarSize,
    showRightSidebar,
  ]);

  React.useEffect(() => {
    if (isDividerDraggingRef.current) {
      return;
    }

    logSidebarLayout("ROOT_CONTEXT_SIZE", "Context left sidebar size changed", {
      leftSidebarSize,
    });
    setLiveLeftSidebarSize(leftSidebarSize);
  }, [leftSidebarSize]);

  React.useEffect(() => {
    setToggleRightSidebar(() => {
      if (!showRightSidebar) return;
      if (isRightCollapsed) {
        rightPanelRef.current?.expand();
      } else {
        rightPanelRef.current?.collapse();
      }
    });
    return () => setToggleRightSidebar(null);
  }, [isRightCollapsed, setToggleRightSidebar, showRightSidebar]);

  const handleDividerDragging = useCallback(
    (dragging: boolean) => {
      logSidebarLayout("ROOT_DIVIDER_DRAG", "Root divider drag state changed", {
        dragging,
        pendingLeftSidebarSize: pendingLeftSidebarSizeRef.current,
      });
      isDividerDraggingRef.current = dragging;
      setIsDragging(dragging);
      if (!dragging) {
        const pending = pendingLeftSidebarSizeRef.current;
        if (pending != null) {
          pendingLeftSidebarSizeRef.current = null;
          setLeftSidebarSize(pending);
        }
      }
    },
    [setLeftSidebarSize],
  );

  const handleLeftPanelResize = useCallback(
    (size: number) => {
      logSidebarLayout("ROOT_LEFT_RESIZE", "Root left panel resized", {
        size,
        dragging: isDividerDraggingRef.current,
      });
      setLiveLeftSidebarSize(size);
      if (size > 0.5) {
        setLeftOverlaySize(size);
      }
      if (isDividerDraggingRef.current) {
        pendingLeftSidebarSizeRef.current = size;
        return;
      }
      setLeftSidebarSize(size);
    },
    [setLeftSidebarSize],
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

      setLiveLeftSidebarSize(nextLeftSize);
      if (nextLeftSize > 0.5) {
        setLeftOverlaySize(nextLeftSize);
      }
      const nextRightSize = layout[2];
      if (typeof nextRightSize === "number" && Number.isFinite(nextRightSize) && nextRightSize > 0.5) {
        setRightOverlaySize(nextRightSize);
      }
      if (isDividerDraggingRef.current) {
        pendingLeftSidebarSizeRef.current = nextLeftSize;
        return;
      }
      setLeftSidebarSize(nextLeftSize);
    },
    [setLeftSidebarSize],
  );

  const handleRightPanelResize = useCallback((size: number) => {
    if (size > 0.5) {
      setRightOverlaySize(size);
    }
  }, []);

  const leftOverlayWidthPx = getSidebarPeekOverlayWidthPx(
    layoutRootWidth,
    leftOverlaySize,
  );
  const rightOverlayWidthPx = getSidebarPeekOverlayWidthPx(
    layoutRootWidth,
    rightOverlaySize,
  );

  const leftPanelNode = (
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
        setLiveLeftSidebarSize(0);
        setLeftSidebarSize(0);
      }}
      onExpand={() => {
        logSidebarLayout("ROOT_LEFT_EXPAND", "Root left panel expanded", {
          currentLeftSidebarSize: leftSidebarSize,
        });
        setIsLeftCollapsed(false);
      }}
      className={cn(
        "h-full flex flex-col",
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
  );

  const shouldHideLeftDivider =
    welcomeOverlay.isVisible &&
    welcomeOverlay.animationState === "visible" &&
    !welcomeOverlay.isClosing;

  return (
    <div ref={layoutRootRef} className="relative flex-1 flex min-h-0 overflow-hidden">
      <PanelGroup
        ref={panelGroupRef}
        autoSaveId={ROOT_SIDEBAR_LAYOUT_AUTO_SAVE_ID}
        direction="horizontal"
        onLayout={handleRootLayout}
        storage={storage}
        className="flex-1"
      >
        {/* Left Sidebar */}
        {leftPanelNode}

        <ResizeHandle
          onDragging={handleDividerDragging}
          hitAreaMargins={{ fine: 2, coarse: 4 }}
          className={cn(
            (shouldHideLeftDivider || isLeftCollapsed) && "bg-transparent hover:bg-transparent",
          )}
        />

        {/* Center Stage */}
        <Panel
          id="root-center-stage"
          order={2}
          defaultSize={showRightSidebar ? 80 - DEFAULT_LEFT_SIDEBAR_SIZE : 100 - DEFAULT_LEFT_SIDEBAR_SIZE}
          minSize={25}
          className="h-full"
        >
          {centerStage}
        </Panel>

        {showRightSidebar ? (
          <>
            <ResizeHandle
              onDragging={handleDividerDragging}
              className={cn(isRightCollapsed && "bg-transparent hover:bg-transparent")}
            />

            {/* Right Sidebar */}
            <Panel
              id="root-right-sidebar"
              order={3}
              ref={rightPanelRef}
              collapsible
              defaultSize={DEFAULT_RIGHT_SIDEBAR_SIZE}
              minSize={10}
              maxSize={75}
              collapsedSize={0}
              onResize={handleRightPanelResize}
              onCollapse={() => setIsRightCollapsed(true)}
              onExpand={() => setIsRightCollapsed(false)}
              className={cn(
                "h-full flex flex-col",
                !isDragging && "transition-[flex-grow,flex-shrink,basis] duration-300 ease-in-out",
                isRightCollapsed && "min-w-0!"
              )}
            >
              <SidebarPeekShell
                side="right"
                collapsed={isRightCollapsed}
                widthPx={rightOverlayWidthPx}
              >
                {rightSidebar}
              </SidebarPeekShell>
            </Panel>
          </>
        ) : null}
      </PanelGroup>

      {welcomeOverlay.isVisible && (
        <div
          className={cn(
            "absolute inset-y-0 right-0 z-40",
            !isLeftCollapsed && liveLeftSidebarSize > 0.5 && "border-l border-border",
            welcomeOverlay.animationState === "visible" || welcomeOverlay.isClosing
              ? "transition-transform duration-350 ease-in-out"
              : "",
            welcomeOverlay.isClosing
              ? "translate-y-full"
              : welcomeOverlay.animationState === "visible"
                ? "translate-y-0"
                : "translate-y-full",
          )}
          style={{
            left: `${liveLeftSidebarSize}%`,
          }}
        >
          <HostedWelcomeGate
            onAddProject={welcomeOverlay.openCreateProject}
            onConnectAgent={welcomeOverlay.connectAgent}
            onClose={welcomeOverlay.close}
          />
        </div>
      )}
    </div>
  );
}

interface ResizeHandleProps {
  onDragging: (isDragging: boolean) => void;
  className?: string;
  hitAreaMargins?: {
    fine: number;
    coarse: number;
  };
}

function ResizeHandle({
  onDragging,
  className,
  hitAreaMargins,
}: ResizeHandleProps) {
  return (
    <PanelResizeHandle
      onDragging={onDragging}
      hitAreaMargins={hitAreaMargins}
      className={cn(
        "relative flex w-px items-center justify-center bg-border transition-colors duration-200 hover:bg-border/80 group touch-none",
        className
      )}
    />
  );
}
