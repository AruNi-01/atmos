"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useAppStorage } from "@atmos/shared";
import { ChevronDown, ChevronUp, Minimize } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  ImperativePanelHandle,
  Panel,
  PanelGroup,
  PanelResizeHandle,
} from "@workspace/ui";

import { cn } from "@/shared/lib/utils";
import {
  isStandaloneSurfaceOpen as readStandaloneSurfaceOpen,
  makeStandaloneSurfaceKey,
  markStandaloneSurfaceOpen,
  restoreStandaloneSurface,
  subscribeStandaloneSurface,
} from "@/shared/lib/standalone-window-handoff";

import { usePreviewBrowserState } from "../hooks/use-preview-browser-state";
import { openPreviewBrowserWindow } from "../lib/desktop-preview-browser-window";
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
  const previewToolbarT = useTranslations("preview.toolbar");
  const storage = useAppStorage();
  const runScriptPanelRef = useRef<ImperativePanelHandle>(null);
  const [isRunScriptCollapsed, setIsRunScriptCollapsed] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isPreviewMaximized, setIsPreviewMaximized] = useState(false);
  const standaloneSurfaceKey = useMemo(
    () => makeStandaloneSurfaceKey("preview", workspaceId, projectId),
    [projectId, workspaceId],
  );
  const [isPreviewStandaloneOpen, setIsPreviewStandaloneOpen] = useState(false);
  const {
    browserState,
    handleAddBrowserTab,
    handleCloseBrowserTab,
    handleOpenBrowserTab,
    handlePreviewIconChange,
    handlePreviewTitleChange,
    handleSelectBrowserTab,
    persistBrowserState,
    previewTabsToRender,
    reloadBrowserStateFromPrefs,
    setBrowserTabActivePreviewUrl,
    setBrowserTabPreviewUrl,
  } = usePreviewBrowserState({ workspaceId, projectId });

  useEffect(() => {
    const syncTimer = window.setTimeout(() => {
      setIsPreviewStandaloneOpen(readStandaloneSurfaceOpen(standaloneSurfaceKey));
    }, 0);
    const unsubscribe = subscribeStandaloneSurface(standaloneSurfaceKey, (isOpen, event) => {
      if (event?.action === "restore" || event?.action === "close" || !isOpen) {
        reloadBrowserStateFromPrefs();
      }
      setIsPreviewStandaloneOpen(isOpen);
      window.clearTimeout(syncTimer);
    });
    return () => {
      window.clearTimeout(syncTimer);
      unsubscribe();
    };
  }, [reloadBrowserStateFromPrefs, standaloneSurfaceKey]);

  const handleOpenPreviewBrowserWindow = useCallback(async (targetUrl: string) => {
    setIsPreviewMaximized(false);
    persistBrowserState();
    await openPreviewBrowserWindow({
      url: targetUrl,
      workspaceId,
      projectId,
    });
    markStandaloneSurfaceOpen(standaloneSurfaceKey);
    setIsPreviewStandaloneOpen(true);
  }, [persistBrowserState, projectId, standaloneSurfaceKey, workspaceId]);

  const handleReturnPreviewToEmbedded = useCallback(() => {
    reloadBrowserStateFromPrefs();
    restoreStandaloneSurface(standaloneSurfaceKey);
    setIsPreviewStandaloneOpen(false);
  }, [reloadBrowserStateFromPrefs, standaloneSurfaceKey]);

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
          {isPreviewStandaloneOpen ? (
            <PreviewStandalonePaused
              description={previewToolbarT("standalone.embeddedDescription")}
              isMaximized={isPreviewMaximized}
              minimizeLabel={previewToolbarT("browserTabs.minimizePreview")}
              onMinimize={() => setIsPreviewMaximized(false)}
              onReturn={handleReturnPreviewToEmbedded}
              returnLabel={previewToolbarT("standalone.returnHere")}
              title={previewToolbarT("standalone.embeddedTitle")}
            />
          ) : previewTabsToRender.map((tab) => {
            const isActiveTab = tab.id === browserState.activeTabId;

            return (
              <div
                key={tab.id}
                aria-hidden={!isActiveTab}
                className={cn(
                  "absolute inset-0 min-h-0",
                  isActiveTab ? "z-10 opacity-100" : "pointer-events-none z-0 opacity-0",
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
                  isPreviewStandaloneOpen={isPreviewStandaloneOpen}
                  onOpenPreviewBrowserWindow={handleOpenPreviewBrowserWindow}
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

interface PreviewStandalonePausedProps {
  title: string;
  description: string;
  returnLabel: string;
  onReturn: () => void;
  isMaximized: boolean;
  minimizeLabel: string;
  onMinimize: () => void;
}

function PreviewStandalonePaused({
  title,
  description,
  returnLabel,
  onReturn,
  isMaximized,
  minimizeLabel,
  onMinimize,
}: PreviewStandalonePausedProps) {
  return (
    <div className="absolute inset-0 flex h-full min-h-0 w-full items-center justify-center border border-dashed border-border/60 bg-muted/10 px-6 text-center">
      {isMaximized ? (
        <button
          type="button"
          aria-label={minimizeLabel}
          title={minimizeLabel}
          className="absolute right-3 top-3 inline-flex size-8 items-center justify-center rounded-md border border-border bg-background text-muted-foreground shadow-sm transition-colors hover:bg-accent hover:text-foreground"
          onClick={onMinimize}
        >
          <Minimize className="size-4" />
        </button>
      ) : null}
      <div className="max-w-sm">
        <div className="text-sm font-medium text-foreground">
          {title}
        </div>
        <div className="mt-1 text-xs leading-relaxed text-muted-foreground">
          {description}
        </div>
        <button
          type="button"
          className="mt-4 inline-flex h-8 items-center justify-center rounded-md border border-border bg-background px-3 text-xs font-medium text-foreground shadow-sm transition-colors hover:bg-accent"
          onClick={onReturn}
        >
          {returnLabel}
        </button>
      </div>
    </div>
  );
}

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
