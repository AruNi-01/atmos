"use client";

import React, { useState } from "react";
import { useSearchParams } from "next/navigation";

import { SidebarLayoutProvider } from "@/app-shell/SidebarLayoutContext";
import { cn } from "@/shared/lib/utils";

import { usePreviewBrowserState } from "../hooks/use-preview-browser-state";
import { Preview } from "./Preview";

export function PreviewBrowserStandalonePage() {
  const searchParams = useSearchParams();
  const workspaceId = searchParams.get("workspaceId");
  const projectId = searchParams.get("projectId") ?? undefined;
  const [isPreviewMaximized, setIsPreviewMaximized] = useState(false);
  const {
    browserState,
    handleAddBrowserTab,
    handleCloseBrowserTab,
    handlePreviewIconChange,
    handlePreviewTitleChange,
    handleSelectBrowserTab,
    previewTabsToRender,
    setBrowserTabActivePreviewUrl,
    setBrowserTabPreviewUrl,
  } = usePreviewBrowserState({ workspaceId, projectId });

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
                  isActive={isActiveTab}
                  isMaximized={isActiveTab && isPreviewMaximized}
                  isStandaloneBrowserWindow
                  setIsMaximized={setIsPreviewMaximized}
                  workspaceId={workspaceId}
                  projectId={projectId}
                  onPageTitleChange={(title) =>
                    handlePreviewTitleChange(tab.id, title)
                  }
                  onPageIconChange={(faviconUrl) =>
                    handlePreviewIconChange(tab.id, faviconUrl)
                  }
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
