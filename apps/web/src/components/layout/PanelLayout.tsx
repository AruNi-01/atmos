"use client";

import React, { useState, useRef } from "react";
import {
  Panel,
  PanelGroup,
  PanelResizeHandle,
  ImperativePanelHandle,
} from "@workspace/ui";
import { cn } from "@/lib/utils";
import { useAppStorage } from "@atmos/shared";
import { useContextParams } from "@/hooks/use-context-params";

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
  const leftPanelRef = useRef<ImperativePanelHandle>(null);
  const rightPanelRef = useRef<ImperativePanelHandle>(null);
  const showRightSidebar = currentView === "project" || currentView === "workspace";

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
        onDragging={setIsDragging}
      />

      {/* Center Stage */}
      <Panel defaultSize={showRightSidebar ? 60 : 80} minSize={25} className="h-full">
        {centerStage}
      </Panel>

      {showRightSidebar ? (
        <>
          <ResizeHandle
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
        </>
      ) : null}
    </PanelGroup>
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
        "before:absolute before:inset-y-0 before:-left-1 before:-right-1 before:z-10", // Expand hit area
        className
      )}
    />
  );
}
