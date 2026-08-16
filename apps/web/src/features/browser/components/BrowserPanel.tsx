"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";

import { Minimize } from "lucide-react";
import { useTranslations } from "next-intl";
import { useQueryStates } from "nuqs";
import { createPortal } from "react-dom";

import { useConnectionStore } from "@/features/connection/store/connection-store";
import { useEditorStore } from "@/features/editor/store/use-editor-store";
import { useContextParams } from "@/shared/hooks/use-context-params";
import { centerStageParams } from "@/shared/lib/nuqs/searchParams";
import { cn } from "@/shared/lib/utils";
import {
  isStandaloneSurfaceOpen as readStandaloneSurfaceOpen,
  makeStandaloneSurfaceKey,
  markStandaloneSurfaceOpen,
  restoreStandaloneSurface,
  subscribeStandaloneSurface,
} from "@/shared/lib/standalone-window-handoff";
import { useUiPrefStore } from "@/shared/stores/use-ui-pref-store";

import { useBrowserAgentTabBridge } from "../hooks/use-browser-agent-tab-bridge";
import { useBrowserState } from "../hooks/use-browser-state";
import { useBrowserSessionMapStore } from "../store/use-browser-session-map";
import { openBrowserWindow } from "../lib/desktop-browser-window";
import {
  cloneBrowserContext,
  createInitialBrowserContext,
  DEFAULT_PREVIEW_BROWSER_PREFS,
  type PreviewBrowserPrefs,
} from "../lib/browser-labels";
import { useBrowserCenterTabsStore } from "../store/use-browser-center-tabs";
import {
  BrowserSession,
  type BrowserCanvasViewportController,
} from "./BrowserSession";

interface BrowserPanelProps {
  workspaceId: string | null;
  projectId?: string;
  isActive?: boolean;
  browserContextId?: string;
  allowStandaloneWindow?: boolean;
  allowMaximize?: boolean;
  /** Show chrome action to hand off this browser into Center Stage. */
  allowMoveToCenter?: boolean;
  keepInactiveTabsMounted?: boolean;
  syncUrlQueryParam?: boolean;
  canvasViewportControllerRef?: React.MutableRefObject<BrowserCanvasViewportController | null>;
  className?: string;
}

export const BrowserPanel: React.FC<BrowserPanelProps> = ({
  workspaceId,
  projectId,
  isActive = false,
  browserContextId,
  allowStandaloneWindow = true,
  allowMaximize = true,
  allowMoveToCenter = false,
  keepInactiveTabsMounted = true,
  syncUrlQueryParam = true,
  canvasViewportControllerRef,
  className,
}) => {
  const previewToolbarT = useTranslations("browser.toolbar");
  const { effectiveContextId } = useContextParams();
  const [, setCenterStageParams] = useQueryStates(centerStageParams);
  const setActiveFile = useEditorStore((state) => state.setActiveFile);
  const openBrowserCenterTab = useBrowserCenterTabsStore((state) => state.openBrowser);
  const activeInstanceId = useConnectionStore((state) => state.activeInstanceId);
  const [isPreviewMaximized, setIsPreviewMaximized] = useState(false);
  const [isPreviewStandaloneOpen, setIsPreviewStandaloneOpen] = useState(false);
  const {
    browserContextId: resolvedBrowserContextId,
    browserState,
    handleAddBrowserTab,
    handleCloseBrowserTab,
    handleOpenBrowserTab,
    handleBrowserSessionReady,
    handlePreviewIconChange,
    handlePreviewTitleChange,
    handleReorderBrowserTabs,
    handleSelectBrowserTab,
    persistBrowserState,
    previewTabsToRender,
    reloadBrowserStateFromPrefs,
    resetBrowserState,
    setBrowserTabActivePreviewUrl,
    setBrowserTabPreviewUrl,
    urlFocusTabId,
  } = useBrowserState({
    workspaceId,
    projectId,
    browserContextId,
    syncUrlQueryParam,
  });
  useBrowserAgentTabBridge({
    contextId: resolvedBrowserContextId,
    isActive,
    tabCount: browserState.tabs.length,
  });
  const handleSessionReady = useCallback((tabId: string, sessionId: string | null) => {
    handleBrowserSessionReady(tabId, sessionId);
    if (sessionId) {
      useBrowserSessionMapStore.getState().bindSession(
        resolvedBrowserContextId,
        tabId,
        sessionId,
      );
    } else {
      useBrowserSessionMapStore.getState().unbindTab(tabId);
    }
  }, [handleBrowserSessionReady, resolvedBrowserContextId]);
  // Per-instance handoff so opening one browser in a Desktop window does not
  // pause every other browser (sidebar / other center instances).
  const standaloneSurfaceKey = useMemo(
    () =>
      makeStandaloneSurfaceKey(
        "browser",
        workspaceId,
        projectId,
        resolvedBrowserContextId,
      ),
    [projectId, resolvedBrowserContextId, workspaceId],
  );

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
    await openBrowserWindow({
      url: targetUrl,
      workspaceId,
      projectId,
      browserContextId: resolvedBrowserContextId,
    });
    markStandaloneSurfaceOpen(standaloneSurfaceKey);
    setIsPreviewStandaloneOpen(true);
  }, [
    allowStandaloneWindow,
    persistBrowserState,
    projectId,
    resolvedBrowserContextId,
    standaloneSurfaceKey,
    workspaceId,
  ]);

  const handleReturnPreviewToEmbedded = useCallback(() => {
    reloadBrowserStateFromPrefs();
    restoreStandaloneSurface(standaloneSurfaceKey);
    setIsPreviewStandaloneOpen(false);
  }, [reloadBrowserStateFromPrefs, standaloneSurfaceKey]);

  const handleMoveToCenter = useCallback(() => {
    if (!allowMoveToCenter || !effectiveContextId) return;

    // Snapshot current sidebar browser before resetting.
    const movedState = cloneBrowserContext(browserState);
    const centerTab = openBrowserCenterTab(effectiveContextId);

    const prefs =
      (useUiPrefStore
        .getState()
        .readSlice(
          activeInstanceId,
          "previewBrowser",
          DEFAULT_PREVIEW_BROWSER_PREFS,
        ) as PreviewBrowserPrefs) ?? DEFAULT_PREVIEW_BROWSER_PREFS;

    useUiPrefStore.getState().writeSlice(activeInstanceId, "previewBrowser", {
      byContext: {
        ...prefs.byContext,
        // Seed the new center browser with the moved tabs/titles.
        [centerTab.browserContextId]: movedState,
        // Right sidebar returns to a fresh single empty tab.
        [resolvedBrowserContextId]: createInitialBrowserContext(""),
      },
    } satisfies PreviewBrowserPrefs);

    resetBrowserState("");
    setIsPreviewMaximized(false);
    setActiveFile(null, effectiveContextId);
    void setCenterStageParams({ tab: centerTab.value, wikiPage: null });
  }, [
    activeInstanceId,
    allowMoveToCenter,
    browserState,
    effectiveContextId,
    openBrowserCenterTab,
    resetBrowserState,
    resolvedBrowserContextId,
    setActiveFile,
    setCenterStageParams,
  ]);

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
        <BrowserSession
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
          canvasViewportControllerRef={canvasViewportControllerRef}
          onOpenPreviewBrowserWindow={
            allowStandaloneWindow ? handleOpenPreviewBrowserWindow : undefined
          }
          onMoveToCenter={allowMoveToCenter ? handleMoveToCenter : undefined}
          onPageTitleChange={(title, pageUrl) =>
            handlePreviewTitleChange(tab.id, title, pageUrl)
          }
          onPageIconChange={(faviconUrl) =>
            handlePreviewIconChange(tab.id, faviconUrl)
          }
          onOpenPageInNewTab={handleOpenBrowserTab}
          onSessionReady={(sessionId) => handleSessionReady(tab.id, sessionId)}
          requestUrlFocus={urlFocusTabId === tab.id}
          browserTabBarProps={{
            tabs: browserState.tabs,
            activeTabId: browserState.activeTabId,
            onAddTab: handleAddBrowserTab,
            onCloseTab: handleCloseBrowserTab,
            onSelectTab: handleSelectBrowserTab,
            onReorderTabs: handleReorderBrowserTabs,
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
          // Fullscreen browser portal — mark for webview pointer-events policy
          // so sibling desktop guests do not steal clicks under this overlay.
          <div
            data-atmos-browser-surface-overlay="true"
            className="fixed inset-0 z-[1000] h-screen w-screen overflow-hidden bg-background animate-in fade-in zoom-in-95 slide-in-from-bottom-2"
          >
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
