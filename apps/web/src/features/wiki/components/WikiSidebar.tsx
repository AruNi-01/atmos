"use client";

import React, { useState } from "react";
import { useTranslations } from "next-intl";
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
import {
  ChevronRight,
  Clock,
  ExternalLink,
  FilePlus,
  Info,
  LoaderCircle,
  RotateCw,
} from "lucide-react";
import { Github, Gitlab } from "@workspace/ui/components/icons/lucide-brand-icons";
import { formatLocalDateTime } from "@atmos/shared";
import type { CatalogData, CatalogItem } from "../lib/wiki-utils";
import type { WikiUpdateStatus } from "@/features/wiki/store/use-wiki-store";
import { isTopLevelSection } from "../lib/wiki-utils";

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
        "group/leaf flex w-full cursor-pointer items-center gap-2 rounded-none px-3 py-1.5 text-left text-sm",
        "hover:bg-accent/50",
        isActive && "bg-accent text-accent-foreground",
      )}
      style={{ paddingLeft: `${depth * 12 + 12}px` }}
    >
      <span className="flex-1 truncate">{item.title}</span>
      {item.reading_time && (
        <span className="flex shrink-0 items-center gap-0.5 text-[10px] text-muted-foreground opacity-0 transition-opacity group-hover/leaf:opacity-100">
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
          "flex w-full items-center rounded-none text-sm",
          "hover:bg-accent/50",
          isActive && "bg-accent",
        )}
        style={{ paddingLeft: `${depth * 12 + 12}px` }}
      >
        {/* Chevron toggle — only controls expand/collapse */}
        <CollapsibleTrigger className="mr-1 flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground">
          <ChevronRight className={cn("size-3.5 transition-transform", open && "rotate-90")} />
        </CollapsibleTrigger>
        {/* Title — clickable to navigate when group has an index file, otherwise toggles collapse */}
        {hasFile ? (
          <button
            type="button"
            onClick={() => onSelectPage(item.file)}
            className={cn(
              "min-w-0 flex-1 cursor-pointer truncate py-1.5 pr-3 text-left font-medium",
              isActive ? "text-accent-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {item.title}
          </button>
        ) : (
          <CollapsibleTrigger className="min-w-0 flex-1 cursor-pointer truncate py-1.5 pr-3 text-left font-medium text-muted-foreground hover:text-foreground">
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
            "group/section flex h-8 w-full cursor-pointer items-center gap-2 rounded-none px-4 text-left",
            "hover:bg-accent/50",
            isActive && "bg-accent",
          )}
        >
          <span
            className={cn(
              "text-xs leading-none font-semibold tracking-wider uppercase",
              isActive
                ? "text-accent-foreground"
                : "text-muted-foreground group-hover/section:text-foreground",
            )}
          >
            {item.title}
          </span>
        </button>
      ) : (
        <div className="flex h-8 items-center gap-2 px-4">
          <span className="text-xs leading-none font-semibold tracking-wider text-muted-foreground uppercase">
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
    return <WikiSidebarSection item={item} activePage={activePage} onSelectPage={onSelectPage} />;
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
  const t = useTranslations("wiki.sidebar");
  const [infoOpen, setInfoOpen] = useState(false);
  const sorted = [...catalog.catalog].sort((a, b) => a.order - b.order);
  const project = catalog.project;
  const hasUpdate = updateStatus?.hasUpdate ?? false;
  const needsRegeneration = updateStatus?.needsRegeneration ?? false;
  const checking = updateStatus?.checking ?? false;

  const formatGeneratedAt = (iso: string) => {
    try {
      return formatLocalDateTime(iso, "yyyy-MM-dd HH:mm:ss");
    } catch {
      return iso;
    }
  };

  return (
    <div className="flex h-full flex-col bg-background">
      {/* 项目名称区域：名称+Info 合成一个按钮，右侧仅保留刷新按钮 */}
      <div className="flex h-10 w-full shrink-0 items-stretch border-b border-border bg-muted/20">
        <button
          type="button"
          onClick={() => setInfoOpen(true)}
          title={t("projectInfo")}
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-none px-3 text-left hover:bg-accent/30"
        >
          <h3 className="flex-1 truncate text-base font-semibold text-foreground">
            {project?.name ?? t("fallbackTitle")}
          </h3>
          <Info className="size-4 shrink-0 text-muted-foreground" />
        </button>
        <div className="flex shrink-0 items-center border-l border-border">
          {/* Refresh / Update button */}
          <div className="flex w-10 items-center justify-center">
            {checking ? (
              <span className="flex animate-spin items-center justify-center text-muted-foreground">
                <LoaderCircle className="size-4" />
              </span>
            ) : hasUpdate && onTriggerUpdate ? (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={onTriggerUpdate}
                      className="relative flex size-10 cursor-pointer items-center justify-center text-muted-foreground hover:bg-accent/30"
                      aria-label={t("outdatedAria")}
                    >
                      <RotateCw className="size-4" />
                      <span
                        className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-foreground"
                        aria-hidden
                      />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="w-auto max-w-none whitespace-nowrap">
                    {t("outdatedTooltip")}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : needsRegeneration ? (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="flex size-10 cursor-help items-center justify-center text-muted-foreground">
                      <RotateCw className="size-4" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-[220px]">
                    <p>{t("legacyTooltip")}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="flex size-10 cursor-default items-center justify-center text-muted-foreground">
                      <RotateCw className="size-4" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-[220px]">
                    <p>{t("upToDateTooltip")}</p>
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
                  className="flex size-10 cursor-pointer items-center justify-center border-l border-border text-muted-foreground hover:bg-accent/30"
                  aria-label={t("specifyAria")}
                >
                  <FilePlus className="size-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <p>{t("specifyTooltip")}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      <Dialog open={infoOpen} onOpenChange={setInfoOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{project?.name ?? t("fallbackTitle")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 text-sm">
            {project?.description && (
              <div>
                <p className="mb-1 text-xs font-medium text-muted-foreground">
                  {t("info.description")}
                </p>
                <p className="text-foreground">{project.description}</p>
              </div>
            )}
            {project?.repository && (
              <div>
                <p className="mb-1.5 text-xs font-medium text-muted-foreground">
                  {t("info.repository")}
                </p>
                <a
                  href={project.repository}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-primary hover:underline"
                >
                  {React.createElement(getRepoIcon(project.repository), {
                    className: "size-4 shrink-0",
                  })}
                  <span className="max-w-[280px] truncate">{project.repository}</span>
                  <ExternalLink className="size-3 shrink-0 opacity-60" />
                </a>
              </div>
            )}
            <div className="flex items-start justify-between gap-4 border-t border-border pt-2">
              {catalog.version && (
                <div>
                  <p className="mb-0.5 text-xs font-medium text-muted-foreground">
                    {t("info.version")}
                  </p>
                  <p className="font-mono text-foreground">{catalog.version}</p>
                </div>
              )}
              {catalog.generated_at && (
                <div className="ml-auto text-right">
                  <p className="mb-0.5 text-xs font-medium text-muted-foreground">
                    {t("info.generated")}
                  </p>
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
