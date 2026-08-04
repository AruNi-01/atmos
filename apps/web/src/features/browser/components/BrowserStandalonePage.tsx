"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

import { SidebarLayoutProvider } from "@/app-shell/SidebarLayoutContext";
import {
  closeCurrentStandaloneWindow,
  closeStandaloneSurface,
  makeStandaloneSurfaceKey,
  markStandaloneSurfaceOpen,
  restoreStandaloneSurface,
  subscribeStandaloneSurface,
} from "@/shared/lib/standalone-window-handoff";
import { cn } from "@/shared/lib/utils";

import { useBrowserState } from "../hooks/use-browser-state";
import { BrowserSession } from "./BrowserSession";

export function BrowserStandalonePage() {
  const searchParams = useSearchParams();
  const workspaceId = searchParams.get("workspaceId");
  const projectId = searchParams.get("projectId") ?? undefined;
  const browserContextId = searchParams.get("browserContextId") ?? undefined;
  const [isPreviewMaximized, setIsPreviewMaximized] = useState(false);
  const {
    browserContextId: resolvedBrowserContextId,
    browserState,
    handleAddBrowserTab,
    handleCloseBrowserTab,
    handleOpenBrowserTab,
    handlePreviewIconChange,
    handlePreviewTitleChange,
    handleSelectBrowserTab,
    persistBrowserState,
    previewTabsToRender,
    setBrowserTabActivePreviewUrl,
    setBrowserTabPreviewUrl,
  } = useBrowserState({
    workspaceId,
    projectId,
    browserContextId,
    // Standalone windows own their instance state; avoid fighting main-window ?pvUrl.
    syncUrlQueryParam: false,
  });
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
    markStandaloneSurfaceOpen(standaloneSurfaceKey);
    const unsubscribe = subscribeStandaloneSurface(standaloneSurfaceKey, (_isOpen, event) => {
      if (event?.action === "restore" || event?.action === "close") {
        persistBrowserState();
        void closeCurrentStandaloneWindow();
      }
    });
    const handleBeforeUnload = () => {
      persistBrowserState();
      closeStandaloneSurface(standaloneSurfaceKey);
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      unsubscribe();
    };
  }, [persistBrowserState, standaloneSurfaceKey]);

  const handleCloseStandalonePreviewWindow = useCallback(() => {
    persistBrowserState();
    restoreStandaloneSurface(standaloneSurfaceKey);
    void closeCurrentStandaloneWindow();
  }, [persistBrowserState, standaloneSurfaceKey]);

  return (
    <SidebarLayoutProvider>
      <main className="h-dvh min-h-0 w-full overflow-hidden bg-background text-foreground">
        <div className="relative h-full min-h-0 w-full overflow-hidden">
          {previewTabsToRender.map((tab) => {
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
                  isActive={isActiveTab}
                  isMaximized={isActiveTab && isPreviewMaximized}
                  isStandaloneBrowserWindow
                  setIsMaximized={setIsPreviewMaximized}
                  workspaceId={workspaceId}
                  projectId={projectId}
                  onCloseStandalonePreviewWindow={handleCloseStandalonePreviewWindow}
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
      </main>
    </SidebarLayoutProvider>
  );
}
