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
  cn,
} from "@workspace/ui";
import { ChevronRight, Clock, ExternalLink, Github, Gitlab, Info } from "lucide-react";
import { format } from "date-fns";
import type { CatalogData, CatalogItem } from "./wiki-utils";
import { isTopLevelSection } from "./wiki-utils";

interface WikiSidebarProps {
  catalog: CatalogData;
  activePage: string | null;
  onSelectPage: (file: string) => void;
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

/** Level badge colors */
function getLevelStyle(level?: string): string {
  switch (level) {
    case "beginner":
      return "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400";
    case "intermediate":
      return "bg-amber-500/15 text-amber-600 dark:text-amber-400";
    case "advanced":
      return "bg-rose-500/15 text-rose-600 dark:text-rose-400";
    default:
      return "bg-muted text-muted-foreground";
  }
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

/** Collapsible group: has children, can expand/collapse */
const WikiSidebarGroup: React.FC<{
  item: CatalogItem;
  depth: number;
  activePage: string | null;
  onSelectPage: (file: string) => void;
}> = ({ item, depth, activePage, onSelectPage }) => {
  const [open, setOpen] = useState(depth < 2);
  const sorted = [...item.children].sort((a, b) => a.order - b.order);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger
        className={cn(
          "flex items-center gap-2 w-full py-1.5 px-3 text-left text-sm rounded-none transition-colors cursor-pointer",
          "hover:bg-accent/50 text-muted-foreground hover:text-foreground"
        )}
        style={{ paddingLeft: `${depth * 12 + 12}px` }}
      >
        <ChevronRight
          className={cn("size-3.5 shrink-0 transition-transform", open && "rotate-90")}
        />
        <span className="truncate font-medium">{item.title}</span>
      </CollapsibleTrigger>
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
 * Always expanded, non-clickable, rendered as a fixed label.
 */
const WikiSidebarSection: React.FC<{
  item: CatalogItem;
  activePage: string | null;
  onSelectPage: (file: string) => void;
}> = ({ item, activePage, onSelectPage }) => {
  const sorted = [...item.children].sort((a, b) => a.order - b.order);
  const levelLabel = item.level
    ? item.level.charAt(0).toUpperCase() + item.level.slice(1)
    : null;

  return (
    <div>
      {/* Section header — fixed, not clickable, not collapsible */}
      <div className="flex items-center gap-2 px-4 pt-4 pb-1.5">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {item.title}
        </span>
        {levelLabel && (
          <span
            className={cn(
              "text-[9px] font-medium px-1.5 py-0.5 rounded-full leading-none",
              getLevelStyle(item.level)
            )}
          >
            {levelLabel}
          </span>
        )}
      </div>
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
}) => {
  const [infoOpen, setInfoOpen] = useState(false);
  const sorted = [...catalog.catalog].sort((a, b) => a.order - b.order);
  const project = catalog.project;

  const formatGeneratedAt = (iso: string) => {
    try {
      return format(new Date(iso), "yyyy-MM-dd HH:mm");
    } catch {
      return iso;
    }
  };

  return (
    <div className="flex flex-col h-full bg-background">
      <button
        type="button"
        onClick={() => setInfoOpen(true)}
        title="Project info"
        className="h-10 px-4 border-b border-border shrink-0 w-full flex items-center gap-2 text-left cursor-pointer hover:bg-accent/30 transition-colors rounded-none bg-muted/20"
      >
        <h3 className="text-base font-semibold text-foreground truncate flex-1 min-w-0">
          {project?.name ?? "Project Wiki"}
        </h3>
        <Info className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      </button>

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
        <div className="pb-4">
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
