"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  FileTree as PierreFileTree,
  useFileTree,
} from "@pierre/trees/react";
import type {
  FileTreeIconConfig,
  GitStatusEntry,
} from "@pierre/trees";
import {
  getFileIconName,
  getIconPath,
} from "@workspace/ui";
import { cn } from "@/lib/utils";

type GitStatus = GitStatusEntry["status"];

export interface DiffFileTreeItem {
  path: string;
  gitStatus?: string | null;
  annotation?: string | null;
}

interface DiffFileTreeProps {
  items: DiffFileTreeItem[];
  selectedPath?: string;
  ariaLabel: string;
  className?: string;
  onSelectFile: (path: string) => void;
  onDoubleClickFile?: (path: string) => void;
}

const statusMap: Record<string, GitStatus> = {
  A: "added",
  C: "added",
  D: "deleted",
  M: "modified",
  R: "renamed",
  U: "modified",
  "?": "untracked",
};

function basename(path: string) {
  return path.split("/").pop() || path;
}

function normalizeStatus(status: string | null | undefined): GitStatus | null {
  if (!status) return null;
  return statusMap[status] ?? null;
}

function symbolIdForIconPath(iconPath: string) {
  return `atmos-file-icon-${iconPath.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

function buildIconConfig(paths: string[]): FileTreeIconConfig {
  const iconsByPath = new Map<string, string>();
  const byFileName: Record<string, string> = {};
  const byFileExtension: Record<string, string> = {};

  for (const path of paths) {
    const name = basename(path);
    const iconPath = getIconPath(getFileIconName(name));
    const symbolId = symbolIdForIconPath(iconPath);
    iconsByPath.set(iconPath, symbolId);
    byFileName[name.toLowerCase()] = symbolId;

    const parts = name.toLowerCase().split(".");
    for (let index = 1; index < parts.length; index += 1) {
      byFileExtension[parts.slice(index).join(".")] = symbolId;
    }
  }

  const symbols = Array.from(iconsByPath.entries())
    .map(
      ([iconPath, symbolId]) =>
        `<symbol id="${symbolId}" viewBox="0 0 16 16"><image href="${iconPath}" width="16" height="16" preserveAspectRatio="xMidYMid meet" /></symbol>`,
    )
    .join("");

  return {
    set: "none",
    colored: false,
    spriteSheet: symbols
      ? `<svg data-atmos-file-icon-sprite aria-hidden="true" width="0" height="0" style="position:absolute;width:0;height:0;overflow:hidden">${symbols}</svg>`
      : "",
    byFileName,
    byFileExtension,
  };
}

function getPathFromTreeEvent(event: React.SyntheticEvent<HTMLElement>) {
  const nativeEvent = event.nativeEvent;
  const path =
    typeof nativeEvent.composedPath === "function"
      ? nativeEvent.composedPath()
      : [nativeEvent.target as EventTarget | null];

  for (const entry of path) {
    if (!(entry instanceof HTMLElement)) continue;
    const itemPath = entry.dataset.itemPath;
    if (itemPath) return itemPath;
  }

  return null;
}

function scrollTreeToTop(model: ReturnType<typeof useFileTree>["model"]) {
  requestAnimationFrame(() => {
    const container = model.getFileTreeContainer();
    const scrollElement = container?.shadowRoot?.querySelector<HTMLElement>(
      "[data-file-tree-virtualized-scroll='true']",
    );
    if (scrollElement) {
      scrollElement.scrollTop = 0;
    }
  });
}

export function DiffFileTree({
  items,
  selectedPath,
  ariaLabel,
  className,
  onSelectFile,
  onDoubleClickFile,
}: DiffFileTreeProps) {
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const itemByPath = useMemo(
    () => new Map(items.map((item) => [item.path, item])),
    [items],
  );
  const itemByPathRef = useRef(itemByPath);
  const paths = useMemo(() => items.map((item) => item.path), [items]);
  const gitStatus = useMemo<GitStatusEntry[]>(
    () =>
      items.flatMap((item) => {
        const status = normalizeStatus(item.gitStatus);
        return status ? [{ path: item.path, status }] : [];
      }),
    [items],
  );
  const icons = useMemo(() => buildIconConfig(paths), [paths]);
  const selectedPathRef = useRef(selectedPath);
  const onSelectFileRef = useRef(onSelectFile);

  useEffect(() => {
    itemByPathRef.current = itemByPath;
    selectedPathRef.current = selectedPath;
    onSelectFileRef.current = onSelectFile;
  }, [itemByPath, onSelectFile, selectedPath]);

  const { model } = useFileTree({
    paths,
    flattenEmptyDirectories: true,
    initialExpansion: "open",
    initialSelectedPaths: selectedPath ? [selectedPath] : [],
    fileTreeSearchMode: "hide-non-matches",
    search: false,
    density: "compact",
    gitStatus,
    icons,
    renderRowDecoration: ({ item }) => {
      const annotation = itemByPathRef.current.get(item.path)?.annotation;
      return annotation ? { text: annotation, title: annotation } : null;
    },
    onSelectionChange: (selectedPaths) => {
      const nextPath = selectedPaths[0];
      if (!nextPath || !itemByPathRef.current.has(nextPath)) return;
      if (selectedPathRef.current === nextPath) return;
      onSelectFileRef.current(nextPath);
    },
    unsafeCSS: `
      :host {
        --trees-bg-override: transparent;
        --trees-fg-override: var(--sidebar-foreground);
        --trees-fg-muted-override: var(--muted-foreground);
        --trees-bg-muted-override: color-mix(in srgb, var(--sidebar-accent) 55%, transparent);
        --trees-selected-bg-override: var(--sidebar-accent);
        --trees-selected-fg-override: var(--sidebar-foreground);
        --trees-focus-ring-color-override: color-mix(in srgb, var(--primary) 62%, var(--border));
        --trees-selected-focused-border-color-override: color-mix(in srgb, var(--primary) 62%, var(--border));
        --trees-focus-ring-width-override: 1px;
        --trees-focus-ring-offset-override: -1px;
        --trees-border-color-override: color-mix(in srgb, var(--sidebar-border) 70%, transparent);
        --trees-font-family-override: inherit;
        --trees-font-size-override: 13px;
        --trees-border-radius-override: var(--radius-md);
        --trees-item-padding-x-override: 8px;
        --trees-item-margin-x-override: 0px;
        --trees-level-gap-override: 10px;
        --trees-search-bg-override: hsl(var(--background));
        --trees-search-fg-override: hsl(var(--foreground));
        --trees-status-added-override: #10b981;
        --trees-status-untracked-override: #10b981;
        --trees-status-modified-override: #eab308;
        --trees-status-renamed-override: #38bdf8;
        --trees-status-deleted-override: #ef4444;
      }
      [data-type='item'] {
        cursor: pointer;
      }
      [data-type='item']:focus-visible::before,
      [data-type='item'][data-item-focused='true']::before,
      [data-type='item'][data-item-selected='true']::before {
        outline: none;
      }
      [data-item-section='decoration'] {
        color: var(--muted-foreground);
        font-family: var(--font-geist-mono), ui-monospace, SFMono-Regular, Menlo, monospace;
        font-size: 11px;
      }
    `,
  });

  useEffect(() => {
    model.resetPaths(paths);
    model.setGitStatus(gitStatus);
    model.setIcons(icons);
    scrollTreeToTop(model);
  }, [gitStatus, icons, model, paths]);

  useEffect(() => {
    model.setSearch(isSearchOpen ? searchValue.trim() || null : null);
    scrollTreeToTop(model);
  }, [isSearchOpen, model, searchValue]);

  useEffect(() => {
    if (!isSearchOpen) return;
    requestAnimationFrame(() => {
      searchInputRef.current?.focus({ preventScroll: true });
      searchInputRef.current?.select();
    });
  }, [isSearchOpen]);

  useEffect(() => {
    if (!selectedPath || !itemByPath.has(selectedPath)) return;
    const item = model.getItem(selectedPath);
    item?.select();
  }, [itemByPath, model, selectedPath]);

  return (
    <div
      className={cn("flex h-full min-h-[180px] w-full flex-col", className)}
      onKeyDown={(event) => {
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "f") {
          event.preventDefault();
          event.stopPropagation();
          setIsSearchOpen(true);
        }
      }}
    >
      {isSearchOpen ? (
        <input
          ref={searchInputRef}
          type="search"
          value={searchValue}
          onChange={(event) => setSearchValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              setSearchValue("");
              setIsSearchOpen(false);
            }
          }}
          placeholder="Search..."
          aria-label={`${ariaLabel} search`}
          className="mx-2 mb-2 mt-1 h-7 shrink-0 rounded-md border border-sidebar-border/50 bg-background px-2 text-[13px] text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background"
        />
      ) : null}
      <PierreFileTree
        model={model}
        aria-label={ariaLabel}
        className="block min-h-0 w-full flex-1"
        onDoubleClick={(event) => {
          const path = getPathFromTreeEvent(event);
          if (path && itemByPath.has(path)) {
            onDoubleClickFile?.(path);
          }
        }}
      />
    </div>
  );
}
