"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";

import { Minimize } from "lucide-react";
import { useTranslations } from "next-intl";
import { createPortal } from "react-dom";

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
import {
  Preview,
  type PreviewCanvasViewportController,
} from "./Preview";

interface BrowserPanelProps {
  workspaceId: string | null;
  projectId?: string;
  isActive?: boolean;
  browserContextId?: string;
  allowStandaloneWindow?: boolean;
  allowMaximize?: boolean;
  disableNativePreviewOcclusion?: boolean;
  keepInactiveTabsMounted?: boolean;
  syncUrlQueryParam?: boolean;
  canvasViewportControllerRef?: React.MutableRefObject<PreviewCanvasViewportController | null>;
  className?: string;
}

export const BrowserPanel: React.FC<BrowserPanelProps> = ({
  workspaceId,
  projectId,
  isActive = false,
  browserContextId,
  allowStandaloneWindow = true,
  allowMaximize = true,
  disableNativePreviewOcclusion = false,
  keepInactiveTabsMounted = true,
  syncUrlQueryParam = true,
  canvasViewportControllerRef,
  className,
}) => {
  const previewToolbarT = useTranslations("preview.toolbar");
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
  } = usePreviewBrowserState({
    workspaceId,
    projectId,
    browserContextId,
    syncUrlQueryParam,
  });

  useEffect(() => {
    if (!allowStandaloneWindow) {
      return;
    }

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
  }, [allowStandaloneWindow, reloadBrowserStateFromPrefs, standaloneSurfaceKey]);

  const effectiveIsPreviewStandaloneOpen =
    allowStandaloneWindow && isPreviewStandaloneOpen;
  const tabsToRender = useMemo(
    () =>
      keepInactiveTabsMounted
        ? previewTabsToRender
        : previewTabsToRender.filter((tab) => tab.id === browserState.activeTabId),
    [browserState.activeTabId, keepInactiveTabsMounted, previewTabsToRender],
  );

  const handleOpenPreviewBrowserWindow = useCallback(async (targetUrl: string) => {
    if (!allowStandaloneWindow) return;

    setIsPreviewMaximized(false);
    persistBrowserState();
    await openPreviewBrowserWindow({
      url: targetUrl,
      workspaceId,
      projectId,
    });
    markStandaloneSurfaceOpen(standaloneSurfaceKey);
    setIsPreviewStandaloneOpen(true);
  }, [allowStandaloneWindow, persistBrowserState, projectId, standaloneSurfaceKey, workspaceId]);

  const handleReturnPreviewToEmbedded = useCallback(() => {
    reloadBrowserStateFromPrefs();
    restoreStandaloneSurface(standaloneSurfaceKey);
    setIsPreviewStandaloneOpen(false);
  }, [reloadBrowserStateFromPrefs, standaloneSurfaceKey]);

  const browserContent = effectiveIsPreviewStandaloneOpen ? (
    <PreviewStandalonePaused
      description={previewToolbarT("standalone.embeddedDescription")}
      isMaximized={isPreviewMaximized}
      minimizeLabel={previewToolbarT("browserTabs.minimizePreview")}
      onMinimize={() => setIsPreviewMaximized(false)}
      onReturn={handleReturnPreviewToEmbedded}
      returnLabel={previewToolbarT("standalone.returnHere")}
      title={previewToolbarT("standalone.embeddedTitle")}
    />
  ) : tabsToRender.map((tab) => {
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
          allowMaximize={allowMaximize}
          isPreviewStandaloneOpen={effectiveIsPreviewStandaloneOpen}
          disableNativePreviewOcclusion={disableNativePreviewOcclusion}
          canvasViewportControllerRef={canvasViewportControllerRef}
          onOpenPreviewBrowserWindow={
            allowStandaloneWindow ? handleOpenPreviewBrowserWindow : undefined
          }
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
  });

  const panelShellClassName = cn(
    "relative h-full min-h-0 w-full overflow-hidden bg-background",
    className,
  );

  if (isPreviewMaximized && typeof document !== "undefined") {
    return (
      <div className={panelShellClassName}>
        {createPortal(
          <div className="fixed inset-0 z-[1000] h-screen w-screen overflow-hidden bg-background animate-in fade-in zoom-in-95 slide-in-from-bottom-2">
            {browserContent}
          </div>,
          document.body,
        )}
      </div>
    );
  }

  return (
    <div className={panelShellClassName}>
      {browserContent}
    </div>
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
