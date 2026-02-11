"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  Button,
  Panel,
  PanelGroup,
  PanelResizeHandle,
  cn,
} from "@workspace/ui";
import type { ImperativePanelHandle } from "react-resizable-panels";
import { useAppStorage } from "@atmos/shared";
import { AlertTriangle, ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import { useWikiContext } from "@/hooks/use-wiki-store";
import { WikiSidebar } from "./WikiSidebar";
import { WikiContent } from "./WikiContent";
import { WikiToc } from "./WikiToc";

interface WikiViewerProps {
  contextId: string;
  effectivePath: string;
  projectName?: string;
  /** Current wiki page from URL */
  wikiPage?: string;
  /** Called when wiki page changes — syncs to URL */
  onWikiPageChange: (page: string) => void;
}

export const WikiViewer: React.FC<WikiViewerProps> = ({
  contextId,
  effectivePath,
  projectName,
  wikiPage,
  onWikiPageChange,
}) => {
  const { catalog, catalogLoading, catalogError, activePage, loadCatalog, loadPage } =
    useWikiContext(contextId);
  const storage = useAppStorage();

  // Left sidebar collapse state
  const sidebarRef = useRef<ImperativePanelHandle>(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // Handle page selection — load content + sync URL
  const handleSelectPage = useCallback(
    (file: string) => {
      loadPage(effectivePath, file);
      const slug = file.replace(/\.md$/, "");
      onWikiPageChange(slug);
    },
    [effectivePath, loadPage, onWikiPageChange]
  );

  // On mount: if URL has a wikiPage, load it; otherwise load first page
  useEffect(() => {
    if (!effectivePath || !catalog) return;

    if (wikiPage) {
      // URL has a page — load it (add .md extension for file lookup)
      const file = wikiPage.endsWith(".md") ? wikiPage : `${wikiPage}.md`;
      if (!activePage || activePage !== wikiPage) {
        loadPage(effectivePath, file);
      }
    } else {
      // No page in URL — load first page and update URL
      const first = getFirstPage(catalog.catalog);
      if (first && !activePage) {
        const slug = first.file.replace(/\.md$/, "");
        loadPage(effectivePath, first.file);
        onWikiPageChange(slug);
      }
    }
  }, [effectivePath, catalog]); // eslint-disable-line react-hooks/exhaustive-deps

  // Loading state
  if (catalogLoading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <RefreshCw className="size-4 animate-spin mr-2" />
        Loading catalog...
      </div>
    );
  }

  // Error state
  if (catalogError || (!catalogLoading && !catalog)) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
        <AlertTriangle className="size-5 text-destructive" />
        <p className="text-sm">{catalogError || "Failed to load wiki catalog."}</p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => loadCatalog(effectivePath)}
        >
          <RefreshCw className="size-3.5 mr-1.5" />
          Retry
        </Button>
      </div>
    );
  }

  if (!catalog) return null;

  return (
    <div className="flex h-full overflow-hidden relative">
      <PanelGroup
        direction="horizontal"
        className="flex-1 overflow-hidden"
        autoSaveId="wiki-viewer-layout"
        storage={storage}
      >
        {/* Left Sidebar */}
        <Panel
          ref={sidebarRef}
          defaultSize={20}
          minSize={15}
          maxSize={30}
          collapsible
          collapsedSize={0}
          onCollapse={() => setIsSidebarCollapsed(true)}
          onExpand={() => setIsSidebarCollapsed(false)}
          className={cn(
            "h-full",
            !isDragging && "transition-[flex-grow,flex-shrink,basis] duration-300 ease-in-out",
            isSidebarCollapsed && "min-w-0!"
          )}
        >
          <WikiSidebar
            catalog={catalog}
            activePage={activePage}
            onSelectPage={handleSelectPage}
          />
        </Panel>

        {/* Resize Handle with collapse/expand button */}
        <PanelResizeHandle
          onDragging={setIsDragging}
          className={cn(
            "relative flex w-px items-center justify-center bg-border transition-colors duration-200 hover:bg-border/80 group touch-none",
            "before:absolute before:inset-y-0 before:-left-1 before:-right-1 before:z-10"
          )}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (isSidebarCollapsed) {
                sidebarRef.current?.expand();
              } else {
                sidebarRef.current?.collapse();
              }
            }}
            title={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            className={cn(
              "absolute z-50 flex size-5 items-center justify-center rounded-full bg-muted border border-border shadow-lg transition-all duration-200 hover:bg-muted/80 hover:scale-110 opacity-0 group-hover:opacity-100 cursor-pointer",
              "left-1/2 -translate-x-1/2",
              isSidebarCollapsed && "hover:opacity-100! hover:bg-accent!"
            )}
          >
            {isSidebarCollapsed ? (
              <ChevronRight className="size-3 text-muted-foreground" />
            ) : (
              <ChevronLeft className="size-3 text-muted-foreground" />
            )}
          </button>
        </PanelResizeHandle>

        {/* Main Content */}
        <Panel defaultSize={80} minSize={50}>
          <WikiContent contextId={contextId} effectivePath={effectivePath} />
        </Panel>
      </PanelGroup>

      {/* Notion-style floating TOC on right edge */}
      <WikiToc contextId={contextId} />
    </div>
  );
};

interface CatalogItemLike {
  file: string;
  order?: number;
  children?: CatalogItemLike[];
}

function getFirstPage(items: CatalogItemLike[]): { file: string } | null {
  const sorted = [...items].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  for (const item of sorted) {
    if (item.children?.length) {
      const child = getFirstPage(item.children);
      if (child) return child;
    } else if (item.file) {
      return { file: item.file };
    }
  }
  return null;
}
