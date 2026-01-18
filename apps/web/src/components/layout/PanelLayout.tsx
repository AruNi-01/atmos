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
import { useAppStorage } from "@vibe-habitat/shared";

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
        minSize={15}
        maxSize={40}
        collapsedSize={0}
        onCollapse={() => setIsLeftCollapsed(true)}
        onExpand={() => setIsLeftCollapsed(false)}
        className={cn(
          "h-full transition-all duration-300 ease-in-out",
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
      />

      {/* Center Stage */}
      <Panel defaultSize={60} minSize={30} className="h-full">
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
      />

      {/* Right Sidebar */}
      <Panel
        ref={rightPanelRef}
        collapsible
        defaultSize={20}
        minSize={15}
        maxSize={40}
        collapsedSize={0}
        onCollapse={() => setIsRightCollapsed(true)}
        onExpand={() => setIsRightCollapsed(false)}
        className={cn(
          "h-full transition-all duration-300 ease-in-out",
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
  className?: string;
}

function ResizeHandle({
  onCollapse,
  isCollapsed,
  side,
  className,
}: ResizeHandleProps) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <PanelResizeHandle
      className={cn(
        "relative flex w-1 items-center justify-center bg-white/5 transition-colors duration-200 hover:bg-white/10 group",
        className
      )}
      onDragging={(isDragging: boolean) => {
        // Optional: handle dragging state
      }}
    >
      {/* Visual Line */}
      <div className="h-full w-px bg-white/5 group-hover:bg-blue-500/50 transition-colors duration-200" />

      {/* Collapse Hint Button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onCollapse();
        }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        title={isCollapsed ? "Expand" : "Collapse"}
        className={cn(
          "absolute z-50 flex size-5 items-center justify-center rounded-full bg-zinc-800 border border-white/10 shadow-lg transition-all duration-200 hover:bg-zinc-700 hover:scale-110 opacity-0 group-hover:opacity-100",
          "left-1/2 -translate-x-1/2",
          isCollapsed && "opacity-100! bg-zinc-700!"
        )}
      >
        {side === "left" ? (
          isCollapsed ? (
            <ChevronRight className="size-3 text-zinc-400" />
          ) : (
            <ChevronLeft className="size-3 text-zinc-400" />
          )
        ) : isCollapsed ? (
          <ChevronLeft className="size-3 text-zinc-400" />
        ) : (
          <ChevronRight className="size-3 text-zinc-400" />
        )}
      </button>
    </PanelResizeHandle>
  );
}
