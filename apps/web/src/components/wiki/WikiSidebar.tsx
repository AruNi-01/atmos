"use client";

import React, { useState } from "react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  ScrollArea,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  cn,
} from "@workspace/ui";
import { ChevronRight, Clock, ExternalLink, FilePlus, Github, Gitlab, Info, RefreshCw } from "lucide-react";
import { format } from "date-fns";
import type { CatalogData, CatalogItem } from "./wiki-utils";
import type { WikiUpdateStatus } from "@/hooks/use-wiki-store";
import { isTopLevelSection } from "./wiki-utils";

interface WikiSidebarProps {
  catalog: CatalogData;
  activePage: string | null;
  onSelectPage: (file: string) => void;
  updateStatus?: WikiUpdateStatus | null;
  onTriggerUpdate?: () => void;
  onTriggerSpecify?: () => void;
}

function getRepoIcon(repoUrl: string): React.ComponentType<{ className?: string }> {
  try {
    const host = new URL(repoUrl).hostname.toLowerCase();
    if (host.includes("github")) return Github;
    if (host.includes("gitlab")) return Gitlab;
  } catch {
    // invalid URL
  }
  return ExternalLink;
}

function isLeaf(item: CatalogItem): boolean {
  return !item.children || item.children.length === 0;
}


/** Leaf item: a clickable page link */
const WikiSidebarLeaf: React.FC<{
  item: CatalogItem;
  depth: number;
  activePage: string | null;
  onSelectPage: (file: string) => void;
}> = ({ item, depth, activePage, onSelectPage }) => {
  const isActive = activePage === item.path || activePage === item.file.replace(/\.md$/, "");
  return (
    <button
      type="button"
      onClick={() => onSelectPage(item.file)}
      className={cn(
        "flex items-center gap-2 w-full py-1.5 px-3 text-left text-sm rounded-none transition-colors cursor-pointer group/leaf",
        "hover:bg-accent/50",
        isActive && "bg-accent text-accent-foreground"
      )}
      style={{ paddingLeft: `${depth * 12 + 12}px` }}
    >
      <span className="truncate flex-1">{item.title}</span>
      {item.reading_time && (
        <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground opacity-0 group-hover/leaf:opacity-100 transition-opacity shrink-0">
          <Clock className="size-2.5" />
          {item.reading_time}m
        </span>
      )}
    </button>
  );
};

/** Collapsible group: has children, can expand/collapse. Title is clickable when it has an index file. */
const WikiSidebarGroup: React.FC<{
  item: CatalogItem;
  depth: number;
  activePage: string | null;
  onSelectPage: (file: string) => void;
}> = ({ item, depth, activePage, onSelectPage }) => {
  const [open, setOpen] = useState(depth < 2);
  const children = item.children ?? [];
  const sorted = [...children].sort((a, b) => a.order - b.order);
  const hasFile = !!item.file;
  const isActive = activePage === item.path || activePage === item.file?.replace(/\.md$/, "");

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div
        className={cn(
          "flex items-center w-full text-sm rounded-none transition-colors",
          "hover:bg-accent/50",
          isActive && "bg-accent"
        )}
        style={{ paddingLeft: `${depth * 12 + 12}px` }}
      >
        {/* Chevron toggle — only controls expand/collapse */}
        <CollapsibleTrigger
          className="shrink-0 size-6 flex items-center justify-center rounded-sm cursor-pointer text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        >
          <ChevronRight
            className={cn("size-3.5 transition-transform", open && "rotate-90")}
          />
        </CollapsibleTrigger>
        {/* Title — clickable to navigate when group has an index file, otherwise toggles collapse */}
        {hasFile ? (
          <button
            type="button"
            onClick={() => onSelectPage(item.file)}
            className={cn(
              "flex-1 min-w-0 py-1.5 pr-3 text-left cursor-pointer truncate font-medium transition-colors",
              isActive ? "text-accent-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {item.title}
          </button>
        ) : (
          <CollapsibleTrigger
            className="flex-1 min-w-0 py-1.5 pr-3 text-left cursor-pointer truncate font-medium text-muted-foreground hover:text-foreground"
          >
            {item.title}
          </CollapsibleTrigger>
        )}
      </div>
      <CollapsibleContent>
        {sorted.map((child) => (
          <WikiSidebarItem
            key={child.id}
            item={child}
            depth={depth + 1}
            activePage={activePage}
            onSelectPage={onSelectPage}
          />
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
};

/**
 * Top-level section header (e.g. "Getting Started", "Deep Dive").
 * Always expanded. Clickable when the section has an index.md file.
 */
const WikiSidebarSection: React.FC<{
  item: CatalogItem;
  activePage: string | null;
  onSelectPage: (file: string) => void;
}> = ({ item, activePage, onSelectPage }) => {
  const children = item.children ?? [];
  const sorted = [...children].sort((a, b) => a.order - b.order);
  const hasFile = !!item.file;
  const isActive = activePage === item.path || activePage === item.file?.replace(/\.md$/, "");

  return (
    <div>
      {/* Section header — clickable when it has an index file */}
      {hasFile ? (
        <button
          type="button"
          onClick={() => onSelectPage(item.file)}
          className={cn(
            "flex items-center gap-2 px-4 h-8 w-full text-left cursor-pointer transition-colors rounded-none group/section",
            "hover:bg-accent/50",
            isActive && "bg-accent"
          )}
        >
          <span
            className={cn(
              "text-xs font-semibold uppercase tracking-wider leading-none",
              isActive ? "text-accent-foreground" : "text-muted-foreground group-hover/section:text-foreground"
            )}
          >
            {item.title}
          </span>
        </button>
      ) : (
        <div className="flex items-center gap-2 px-4 h-8">
          <span className="text-xs font-semibold uppercase tracking-wider leading-none text-muted-foreground">
            {item.title}
          </span>
        </div>
      )}
      {/* Children rendered directly, always visible */}
      {sorted.map((child) => (
        <WikiSidebarItem
          key={child.id}
          item={child}
          depth={1}
          activePage={activePage}
          onSelectPage={onSelectPage}
        />
      ))}
    </div>
  );
};

/** Smart dispatcher: picks the right component based on item type */
const WikiSidebarItem: React.FC<{
  item: CatalogItem;
  depth: number;
  activePage: string | null;
  onSelectPage: (file: string) => void;
}> = ({ item, depth, activePage, onSelectPage }) => {
  // Top-level sections are rendered as fixed section headers
  if (depth === 0 && isTopLevelSection(item)) {
    return (
      <WikiSidebarSection
        item={item}
        activePage={activePage}
        onSelectPage={onSelectPage}
      />
    );
  }

  if (isLeaf(item)) {
    return (
      <WikiSidebarLeaf
        item={item}
        depth={depth}
        activePage={activePage}
        onSelectPage={onSelectPage}
      />
    );
  }

  return (
    <WikiSidebarGroup
      item={item}
      depth={depth}
      activePage={activePage}
      onSelectPage={onSelectPage}
    />
  );
};

export const WikiSidebar: React.FC<WikiSidebarProps> = ({
  catalog,
  activePage,
  onSelectPage,
  updateStatus,
  onTriggerUpdate,
  onTriggerSpecify,
}) => {
  const [infoOpen, setInfoOpen] = useState(false);
  const sorted = [...catalog.catalog].sort((a, b) => a.order - b.order);
  const project = catalog.project;
  const hasUpdate = updateStatus?.hasUpdate ?? false;
  const needsRegeneration = updateStatus?.needsRegeneration ?? false;
  const checking = updateStatus?.checking ?? false;

  const formatGeneratedAt = (iso: string) => {
    try {
      return format(new Date(iso), "yyyy-MM-dd HH:mm");
    } catch {
      return iso;
    }
  };

  return (
    <div className="flex flex-col h-full bg-background">
      {/* 项目名称区域：名称+Info 合成一个按钮，右侧仅保留刷新按钮 */}
      <div className="h-10 shrink-0 w-full flex items-stretch border-b border-border bg-muted/20">
        <button
          type="button"
          onClick={() => setInfoOpen(true)}
          title="Project info"
          className="flex-1 min-w-0 flex items-center gap-2 px-3 text-left cursor-pointer hover:bg-accent/30 transition-colors rounded-none"
        >
          <h3 className="text-base font-semibold text-foreground truncate flex-1">
            {project?.name ?? "Project Wiki"}
          </h3>
          <Info className="size-4 shrink-0 text-muted-foreground" />
        </button>
        <div className="shrink-0 flex items-center border-l border-border">
          {/* Refresh / Update button */}
          <div className="w-10 flex items-center justify-center">
            {checking ? (
              <span className="flex items-center justify-center text-muted-foreground animate-spin">
                <RefreshCw className="size-4" />
              </span>
            ) : hasUpdate && onTriggerUpdate ? (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={onTriggerUpdate}
                      className="relative size-10 flex items-center justify-center text-muted-foreground hover:bg-accent/30 cursor-pointer"
                      aria-label="Wiki is outdated. Click to update."
                    >
                      <RefreshCw className="size-4" />
                      <span className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-foreground" aria-hidden />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-[200px]">
                    <p>Wiki is outdated. Click to update.</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : needsRegeneration ? (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="flex items-center justify-center text-muted-foreground cursor-help size-10">
                      <RefreshCw className="size-4" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-[220px]">
                    <p>Legacy wiki. Regenerate fully to enable incremental updates.</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="flex items-center justify-center text-muted-foreground cursor-default size-10">
                      <RefreshCw className="size-4" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-[220px]">
                    <p>Wiki is up to date</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
          {/* Specify Wiki icon button */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={onTriggerSpecify}
                  className="size-10 flex items-center justify-center text-muted-foreground hover:bg-accent/30 cursor-pointer transition-colors border-l border-border"
                  aria-label="Specify Wiki"
                >
                  <FilePlus className="size-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <p>Specify Wiki</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      <Dialog open={infoOpen} onOpenChange={setInfoOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{project?.name ?? "Project Wiki"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 text-sm">
            {project?.description && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Description</p>
                <p className="text-foreground">{project.description}</p>
              </div>
            )}
            {project?.repository && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1.5">Repository</p>
                <a
                  href={project.repository}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-primary hover:underline"
                >
                  {React.createElement(getRepoIcon(project.repository), {
                    className: "size-4 shrink-0",
                  })}
                  <span className="truncate max-w-[280px]">{project.repository}</span>
                  <ExternalLink className="size-3 shrink-0 opacity-60" />
                </a>
              </div>
            )}
            <div className="flex justify-between items-start gap-4 pt-2 border-t border-border">
              {catalog.version && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-0.5">Version</p>
                  <p className="font-mono text-foreground">{catalog.version}</p>
                </div>
              )}
              {catalog.generated_at && (
                <div className="text-right ml-auto">
                  <p className="text-xs font-medium text-muted-foreground mb-0.5">Generated</p>
                  <p className="text-foreground">{formatGeneratedAt(catalog.generated_at)}</p>
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <ScrollArea className="flex-1">
        <div>
          {sorted.map((item) => (
            <WikiSidebarItem
              key={item.id}
              item={item}
              depth={0}
              activePage={activePage}
              onSelectPage={onSelectPage}
            />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
};
