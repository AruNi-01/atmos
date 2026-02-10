"use client";

import React, { useEffect } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "@workspace/ui";
import { useAppStorage } from "@atmos/shared";
import { useWikiContext } from "@/hooks/use-wiki-store";
import { WikiSidebar } from "./WikiSidebar";
import { WikiContent } from "./WikiContent";
import { WikiToc } from "./WikiToc";

interface WikiViewerProps {
  contextId: string;
  effectivePath: string;
  projectName?: string;
}

export const WikiViewer: React.FC<WikiViewerProps> = ({
  contextId,
  effectivePath,
  projectName,
}) => {
  const { catalog, activePage, loadCatalog, loadPage } = useWikiContext(contextId);
  const storage = useAppStorage();

  useEffect(() => {
    if (effectivePath && catalog) {
      const first = getFirstPage(catalog.catalog);
      if (first && !activePage) {
        loadPage(effectivePath, first.file);
      }
    }
  }, [effectivePath, catalog, activePage, loadPage]);

  if (!catalog) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        Loading catalog...
      </div>
    );
  }

  return (
    <PanelGroup
      direction="horizontal"
      className="flex-1 overflow-hidden"
      autoSaveId="wiki-viewer-layout"
      storage={storage}
    >
      <Panel defaultSize={20} minSize={15} maxSize={30} collapsible>
        <WikiSidebar
          catalog={catalog}
          activePage={activePage}
          onSelectPage={(file) => loadPage(effectivePath, file)}
        />
      </Panel>
      <PanelResizeHandle className="w-px bg-border hover:bg-border/80 transition-colors" />
      <Panel defaultSize={62} minSize={40}>
        <WikiContent contextId={contextId} />
      </Panel>
      <PanelResizeHandle className="w-px bg-border hover:bg-border/80 transition-colors" />
      <Panel defaultSize={18} minSize={12} maxSize={25} collapsible>
        <WikiToc contextId={contextId} />
      </Panel>
    </PanelGroup>
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
