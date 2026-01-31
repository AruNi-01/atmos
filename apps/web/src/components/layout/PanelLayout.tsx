"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  Panel,
  PanelGroup,
  PanelResizeHandle,
  ImperativePanelHandle,
  ChevronLeft,
  ChevronRight,
} from "@workspace/ui";
import { cn } from "@/lib/utils";
import { useAppStorage } from "@atmos/shared";

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
  const leftPanelRef = useRef<ImperativePanelHandle>(null);
  const rightPanelRef = useRef<ImperativePanelHandle>(null);

  const [isLeftCollapsed, setIsLeftCollapsed] = useState(false);
  const [isRightCollapsed, setIsRightCollapsed] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  return (
    <PanelGroup
      autoSaveId="root-sidebar-layout"
      direction="horizontal"
      storage={storage}
      className="flex-1"
    >
      {/* Left Sidebar */}
      <Panel
        ref={leftPanelRef}
        collapsible
        defaultSize={20}
        minSize={10}
        maxSize={30}
        collapsedSize={0}
        onCollapse={() => setIsLeftCollapsed(true)}
        onExpand={() => setIsLeftCollapsed(false)}
        className={cn(
          "h-full flex flex-col",
          !isDragging && "transition-[flex-grow,flex-shrink,basis] duration-300 ease-in-out",
          isLeftCollapsed && "min-w-0!"
        )}
      >
        {leftSidebar}
      </Panel>

      <ResizeHandle
        onCollapse={() => {
          if (isLeftCollapsed) {
            leftPanelRef.current?.expand();
          } else {
            leftPanelRef.current?.collapse();
          }
        }}
        isCollapsed={isLeftCollapsed}
        side="left"
        onDragging={setIsDragging}
      />

      {/* Center Stage */}
      <Panel defaultSize={60} minSize={25} className="h-full">
        {centerStage}
      </Panel>

      <ResizeHandle
        onCollapse={() => {
          if (isRightCollapsed) {
            rightPanelRef.current?.expand();
          } else {
            rightPanelRef.current?.collapse();
          }
        }}
        isCollapsed={isRightCollapsed}
        side="right"
        onDragging={setIsDragging}
      />

      {/* Right Sidebar */}
      <Panel
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
    </PanelGroup>
  );
}

interface ResizeHandleProps {
  onCollapse: () => void;
  isCollapsed: boolean;
  side: "left" | "right";
  onDragging: (isDragging: boolean) => void;
  className?: string;
}

function ResizeHandle({
  onCollapse,
  isCollapsed,
  side,
  onDragging,
  className,
}: ResizeHandleProps) {
  return (
    <PanelResizeHandle
      onDragging={onDragging}
      className={cn(
        "relative flex w-px items-center justify-center bg-border transition-colors duration-200 hover:bg-border/80 group touch-none",
        "before:absolute before:inset-y-0 before:-left-1 before:-right-1 before:z-10", // Expand hit area
        className
      )}
    >
      {/* Visual Line (1px inherited from w-px parent) */}

      {/* Collapse Hint Button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onCollapse();
        }}
        title={isCollapsed ? "Expand" : "Collapse"}
        className={cn(
          "absolute z-50 flex size-5 items-center justify-center rounded-full bg-muted border border-border shadow-lg transition-all duration-200 hover:bg-muted/80 hover:scale-110 opacity-0 group-hover:opacity-100",
          "left-1/2 -translate-x-1/2",
          isCollapsed && "opacity-100! bg-accent!"
        )}
      >
        {side === "left" ? (
          isCollapsed ? (
            <ChevronRight className="size-3 text-muted-foreground" />
          ) : (
            <ChevronLeft className="size-3 text-muted-foreground" />
          )
        ) : isCollapsed ? (
          <ChevronLeft className="size-3 text-muted-foreground" />
        ) : (
          <ChevronRight className="size-3 text-muted-foreground" />
        )}
      </button>
    </PanelResizeHandle>
  );
}
