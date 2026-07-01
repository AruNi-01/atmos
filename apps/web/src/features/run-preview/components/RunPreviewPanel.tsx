"use client";

import React, { useRef, useState } from "react";

import { useAppStorage } from "@atmos/shared";
import { ChevronDown, ChevronUp } from "lucide-react";
import {
  ImperativePanelHandle,
  Panel,
  PanelGroup,
  PanelResizeHandle,
} from "@workspace/ui";

import { cn } from "@/shared/lib/utils";

import { usePreviewBrowserState } from "../hooks/use-preview-browser-state";
import { Preview } from "./Preview";
import { RunScript } from "./RunScript";

interface RunPreviewPanelProps {
  workspaceId: string | null;
  projectId?: string;
  isActive?: boolean;
  projectName?: string;
  workspaceName?: string;
}

export const RunPreviewPanel: React.FC<RunPreviewPanelProps> = ({
  workspaceId,
  projectId,
  isActive = false,
  projectName,
  workspaceName,
}) => {
  const storage = useAppStorage();
  const runScriptPanelRef = useRef<ImperativePanelHandle>(null);
  const [isRunScriptCollapsed, setIsRunScriptCollapsed] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isPreviewMaximized, setIsPreviewMaximized] = useState(false);
  const {
    browserState,
    handleAddBrowserTab,
    handleCloseBrowserTab,
    handleOpenBrowserTab,
    handlePreviewIconChange,
    handlePreviewTitleChange,
    handleSelectBrowserTab,
    previewTabsToRender,
    setBrowserTabActivePreviewUrl,
    setBrowserTabPreviewUrl,
  } = usePreviewBrowserState({ workspaceId, projectId });

  return (
    <PanelGroup
      direction="vertical"
      autoSaveId={`run-preview-layout-${workspaceId || projectId || "default"}`}
      storage={storage}
      className="flex-col h-full w-full overflow-hidden"
    >
      {/* Top: Preview */}
      <Panel defaultSize={70} className="min-h-0">
        <div
          className={cn(
            "relative h-full min-h-0 w-full overflow-hidden bg-background",
            isPreviewMaximized &&
              "fixed inset-0 z-[1000] h-screen w-screen animate-in fade-in zoom-in-95 slide-in-from-bottom-2",
          )}
        >
          {previewTabsToRender.map((tab) => {
            const isActiveTab = tab.id === browserState.activeTabId;

            return (
              <div
                key={tab.id}
                className={cn(
                  "absolute inset-0 min-h-0",
                  isActiveTab ? "z-10" : "pointer-events-none invisible z-0",
                )}
              >
                <Preview
                  url={tab.url}
                  setUrl={(nextUrl) => setBrowserTabPreviewUrl(tab.id, nextUrl)}
                  activeUrl={tab.activeUrl}
                  setActiveUrl={(nextUrl) =>
                    setBrowserTabActivePreviewUrl(tab.id, nextUrl)
                  }
                  isActive={isActive && isActiveTab}
                  isMaximized={isPreviewMaximized}
                  isMaximizedLayoutManaged
                  setIsMaximized={setIsPreviewMaximized}
                  workspaceId={workspaceId}
                  projectId={projectId}
                  onPageTitleChange={(title, pageUrl) =>
                    handlePreviewTitleChange(tab.id, title, pageUrl)
                  }
                  onPageIconChange={(faviconUrl) =>
                    handlePreviewIconChange(tab.id, faviconUrl)
                  }
                  onOpenPageInNewTab={handleOpenBrowserTab}
                  browserTabBarProps={{
                    tabs: browserState.tabs,
                    activeTabId: browserState.activeTabId,
                    onAddTab: handleAddBrowserTab,
                    onCloseTab: handleCloseBrowserTab,
                    onSelectTab: handleSelectBrowserTab,
                  }}
                />
              </div>
            );
          })}
        </div>
      </Panel>

      <VerticalResizeHandle
        onCollapse={() => {
          if (isRunScriptCollapsed) {
            runScriptPanelRef.current?.expand();
          } else {
            runScriptPanelRef.current?.collapse();
          }
        }}
        isCollapsed={isRunScriptCollapsed}
        onDragging={setIsDragging}
        className={cn(isPreviewMaximized && "hidden")}
      />

      {/* Bottom: Run Script */}
      <Panel
        ref={runScriptPanelRef}
        collapsible
        defaultSize={30}
        minSize={10}
        maxSize={50}
        collapsedSize={0}
        onCollapse={() => setIsRunScriptCollapsed(true)}
        onExpand={() => setIsRunScriptCollapsed(false)}
        className={cn(
          "min-h-0 flex flex-col",
          !isDragging &&
            "transition-[flex-grow,flex-shrink,basis] duration-300 ease-in-out",
          isRunScriptCollapsed && "min-h-0!",
          isPreviewMaximized && "hidden",
        )}
      >
        <RunScript
          workspaceId={workspaceId}
          projectId={projectId}
          isActive={isActive && !isPreviewMaximized}
          projectName={projectName}
          workspaceName={workspaceName}
        />
      </Panel>
    </PanelGroup>
  );
};

interface VerticalResizeHandleProps {
  onCollapse: () => void;
  isCollapsed: boolean;
  onDragging: (isDragging: boolean) => void;
  className?: string;
}

function VerticalResizeHandle({
  onCollapse,
  isCollapsed,
  onDragging,
  className,
}: VerticalResizeHandleProps) {
  return (
    <PanelResizeHandle
      onDragging={onDragging}
      className={cn(
        "relative flex h-px w-full items-center justify-center bg-border transition-colors duration-200 hover:bg-border/80 group touch-none",
        "before:absolute before:inset-x-0 before:-top-1 before:-bottom-1 before:z-10", // Expand hit area
        className,
      )}
    >
      {/* Collapse Hint Button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onCollapse();
        }}
        title={isCollapsed ? "Expand" : "Collapse"}
        aria-label={isCollapsed ? "Expand panel" : "Collapse panel"}
        className={cn(
          "absolute z-50 flex size-5 items-center justify-center rounded-full bg-muted border border-border shadow-lg transition-all duration-200 hover:bg-muted/80 hover:scale-110 opacity-0 group-hover:opacity-100",
          // Center horizontally
          "left-1/2 -translate-x-1/2",
          isCollapsed && "hover:opacity-100! hover:bg-accent!",
        )}
      >
        {isCollapsed ? (
          <ChevronUp className="size-3 text-muted-foreground" />
        ) : (
          <ChevronDown className="size-3 text-muted-foreground" />
        )}
      </button>
    </PanelResizeHandle>
  );
}
