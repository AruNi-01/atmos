"use client";

import React, { useState } from "react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  ScrollArea,
  cn,
} from "@workspace/ui";
import { ChevronRight, FileText, FolderOpen } from "lucide-react";
import type { CatalogData, CatalogItem } from "./wiki-utils";

interface WikiSidebarProps {
  catalog: CatalogData;
  activePage: string | null;
  onSelectPage: (file: string) => void;
}

function isLeaf(item: CatalogItem): boolean {
  return !item.children || item.children.length === 0;
}

const WikiSidebarItem: React.FC<{
  item: CatalogItem;
  depth: number;
  activePage: string | null;
  onSelectPage: (file: string) => void;
}> = ({ item, depth, activePage, onSelectPage }) => {
  const [open, setOpen] = useState(depth < 2);

  if (isLeaf(item)) {
    const isActive = activePage === item.path || activePage === item.file.replace(/\.md$/, "");
    return (
      <button
        type="button"
        onClick={() => onSelectPage(item.file)}
        className={cn(
          "flex items-center gap-2 w-full py-1.5 px-3 text-left text-sm rounded-sm transition-colors",
          "hover:bg-accent/50",
          isActive && "bg-accent text-accent-foreground"
        )}
        style={{ paddingLeft: `${depth * 12 + 12}px` }}
      >
        <FileText className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="truncate">{item.title}</span>
      </button>
    );
  }

  const sorted = [...item.children].sort((a, b) => a.order - b.order);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger
        className={cn(
          "flex items-center gap-2 w-full py-1.5 px-3 text-left text-sm rounded-sm transition-colors",
          "hover:bg-accent/50 text-muted-foreground hover:text-foreground"
        )}
        style={{ paddingLeft: `${depth * 12 + 12}px` }}
      >
        <ChevronRight
          className={cn("size-3.5 shrink-0 transition-transform", open && "rotate-90")}
        />
        <FolderOpen className="size-3.5 shrink-0" />
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

export const WikiSidebar: React.FC<WikiSidebarProps> = ({
  catalog,
  activePage,
  onSelectPage,
}) => {
  const sorted = [...catalog.catalog].sort((a, b) => a.order - b.order);

  return (
    <div className="flex flex-col h-full bg-background border-r border-border">
      <div className="px-3 py-3 border-b border-border shrink-0">
        <h3 className="text-sm font-semibold text-foreground truncate">
          {catalog.project?.name ?? "Project Wiki"}
        </h3>
        {catalog.project?.description && (
          <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">
            {catalog.project.description}
          </p>
        )}
      </div>
      <ScrollArea className="flex-1">
        <div className="py-2">
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
