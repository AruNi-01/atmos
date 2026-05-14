"use client";

import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  Panel,
  PanelGroup,
  PanelResizeHandle,
  ImperativePanelHandle,
  ImperativePanelGroupHandle,
} from "@workspace/ui";
import { cn } from "@/lib/utils";
import { useAppStorage } from "@atmos/shared";
import { useQueryState } from "nuqs";
import { useContextParams } from "@/hooks/use-context-params";
import { useSidebarLayout } from "@/components/layout/SidebarLayoutContext";
import { useDialogStore } from "@/hooks/use-dialog-store";
import { useAppRouter } from "@/hooks/use-app-router";
import { centerStageParams } from "@/lib/nuqs/searchParams";
import WelcomePage from "@/components/welcome/WelcomePage";

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
  const isDividerDraggingRef = useRef(false);
  const pendingLeftSidebarSizeRef = useRef<number | null>(null);
  const [newWorkspace, setNewWorkspace] = useQueryState("newWorkspace", centerStageParams.newWorkspace);
  const [isWelcomeClosing, setIsWelcomeClosing] = useState(false);
  const showOverlay = newWorkspace || isWelcomeClosing;
  const [welcomeAnimState, setWelcomeAnimState] = useState<"idle" | "entering" | "visible">("idle");
  const prevNewWorkspaceRef = useRef(false);
  const setCreateProjectOpen = useDialogStore((s) => s.setCreateProjectOpen);
  const router = useAppRouter();
  const previousFocusRef = useRef<Element | null>(null);

  useEffect(() => {
    if (showOverlay && !isWelcomeClosing) {
      previousFocusRef.current = document.activeElement;
    }
  }, [showOverlay, isWelcomeClosing]);

  const handleCloseWelcomeOverlay = useCallback(() => {
    setIsWelcomeClosing(true);
    const savedEl = previousFocusRef.current;
    setTimeout(() => {
      setIsWelcomeClosing(false);
      setWelcomeAnimState("idle");
      void setNewWorkspace(false);
      if (savedEl instanceof HTMLElement && savedEl.isConnected) {
        savedEl.focus();
      }
      previousFocusRef.current = null;
    }, 350);
  }, [setNewWorkspace]);

  React.useEffect(() => {
    setShowRightSidebar(showRightSidebar);
    if (!showRightSidebar) {
      setIsRightCollapsed(false);
    }
  }, [setIsRightCollapsed, setShowRightSidebar, showRightSidebar]);

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

    if (!group || !layout || layout.length < 2) {
      return;
    }

    if (Math.abs(clampedSize - leftSidebarSize) < 0.5) {
      setRequestedLeftSidebarSize(null);
      return;
    }

    if (layout.length === 2 || !showRightSidebar) {
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

    group.setLayout([clampedSize, nextCenter, nextRight]);
    setRequestedLeftSidebarSize(null);
  }, [
    leftSidebarSize,
    requestedLeftSidebarSize,
    setRequestedLeftSidebarSize,
    showRightSidebar,
  ]);

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
      if (isDividerDraggingRef.current) {
        pendingLeftSidebarSizeRef.current = size;
        return;
      }
      setLeftSidebarSize(size);
    },
    [setLeftSidebarSize],
  );

  const leftPanelNode = (
    <Panel
      id="root-left-sidebar"
      order={1}
      ref={leftPanelRef}
      collapsible
      defaultSize={20}
      minSize={10}
      maxSize={50}
      collapsedSize={0}
      onResize={handleLeftPanelResize}
      onCollapse={() => {
        setIsLeftCollapsed(true);
        setLeftSidebarSize(0);
      }}
      onExpand={() => setIsLeftCollapsed(false)}
      className={cn(
        "h-full flex flex-col",
        !isDragging && "transition-[flex-grow,flex-shrink,basis] duration-300 ease-in-out",
        isLeftCollapsed && "min-w-0!"
      )}
    >
      {leftSidebar}
    </Panel>
  );

  React.useEffect(() => {
    if (newWorkspace && !prevNewWorkspaceRef.current) {
      setWelcomeAnimState("entering");
    }
    prevNewWorkspaceRef.current = newWorkspace;
  }, [newWorkspace]);

  React.useEffect(() => {
    if (welcomeAnimState !== "entering") return;
    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setWelcomeAnimState("visible");
      });
    });
    return () => cancelAnimationFrame(raf);
  }, [welcomeAnimState]);
  const shouldHideLeftDivider = showOverlay && welcomeAnimState === "visible" && !isWelcomeClosing;

  return (
    <div className="relative flex-1 flex min-h-0 overflow-hidden">
      <PanelGroup
        ref={panelGroupRef}
        autoSaveId="root-sidebar-layout"
        direction="horizontal"
        storage={storage}
        className="flex-1"
      >
        {/* Left Sidebar */}
        {leftPanelNode}

        <ResizeHandle
          onDragging={handleDividerDragging}
          className={shouldHideLeftDivider ? "bg-transparent hover:bg-transparent" : undefined}
        />

        {/* Center Stage */}
        <Panel
          id="root-center-stage"
          order={2}
          defaultSize={showRightSidebar ? 60 : 80}
          minSize={25}
          className="h-full"
        >
          {centerStage}
        </Panel>

        {showRightSidebar ? (
          <>
            <ResizeHandle
              onDragging={handleDividerDragging}
            />

            {/* Right Sidebar */}
            <Panel
              id="root-right-sidebar"
              order={3}
              ref={rightPanelRef}
              collapsible
              defaultSize={20}
              minSize={10}
              maxSize={75}
              collapsedSize={0}
              onCollapse={() => setIsRightCollapsed(true)}
              onExpand={() => setIsRightCollapsed(false)}
              className={cn(
                "h-full flex flex-col",
                !isDragging && "transition-[flex-grow,flex-shrink,basis] duration-300 ease-in-out",
                isRightCollapsed && "min-w-0!"
              )}
            >
              {rightSidebar}
            </Panel>
          </>
        ) : null}
      </PanelGroup>

      {/* New Workspace overlay – covers center + right, not left sidebar */}
      {showOverlay && (
        <div
          className={cn(
            "absolute inset-y-0 right-0 z-50 border-l border-border",
            welcomeAnimState === "visible" || isWelcomeClosing
              ? "transition-transform duration-350 ease-in-out"
              : "",
            isWelcomeClosing
              ? "translate-y-full"
              : welcomeAnimState === "visible"
                ? "translate-y-0"
                : "translate-y-full",
          )}
          style={{
            left: `${leftSidebarSize}%`,
          }}
        >
          <WelcomePage
            onAddProject={() => setCreateProjectOpen(true)}
            onConnectAgent={() => {
              void setNewWorkspace(false);
              router.push('/agents');
            }}
            onClose={handleCloseWelcomeOverlay}
          />
        </div>
      )}
    </div>
  );
}

interface ResizeHandleProps {
  onDragging: (isDragging: boolean) => void;
  className?: string;
}

function ResizeHandle({
  onDragging,
  className,
}: ResizeHandleProps) {
  return (
    <PanelResizeHandle
      onDragging={onDragging}
      className={cn(
        "relative flex w-px items-center justify-center bg-border transition-colors duration-200 hover:bg-border/80 group touch-none",
        // Narrow grab strip (was -left-1/-right-1 each side → easy to hit when near the divider)
        "before:absolute before:inset-y-0 before:left-1/2 before:z-10 before:w-1 before:-translate-x-1/2",
        className
      )}
    />
  );
}
