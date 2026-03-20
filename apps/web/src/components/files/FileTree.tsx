'use client';

import React, { useMemo, useCallback, useState, useEffect } from 'react';
import { useTree } from '@headless-tree/react';
import { asyncDataLoaderFeature } from '@headless-tree/core';
import type { ItemInstance } from '@headless-tree/core';
import {
  cn,
  getFileIconProps,
  Loader2,
  ChevronRight,
  Folder,
  CornerUpRight,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from '@workspace/ui';
import { FileTreeNode, fsApi } from '@/api/ws-api';
import { useEditorStore } from '@/hooks/use-editor-store';
import { useContextParams } from "@/hooks/use-context-params";

// ===== Types =====

interface FileTreeItem {
  id: string;
  name: string;
  path: string;
  isDir: boolean;
  isSymlink: boolean;
  isIgnored: boolean;
  symlinkTarget?: string;
  children?: string[];
}

interface FileTreeProps {
  data: FileTreeNode[];
  isLoading?: boolean;
}

// ===== Helper Functions =====

function buildItemsMap(nodes: FileTreeNode[]): Map<string, FileTreeItem> {
  const map = new Map<string, FileTreeItem>();

  function traverse(nodes: FileTreeNode[]) {
    for (const node of nodes) {
      const item: FileTreeItem = {
        id: node.path,
        name: node.name,
        path: node.path,
        isDir: node.is_dir,
        isSymlink: node.is_symlink,
        isIgnored: node.is_ignored,
        symlinkTarget: node.symlink_target,
        children: node.children?.map(c => c.path),
      };
      map.set(node.path, item);
      if (node.children) {
        traverse(node.children);
      }
    }
  }

  traverse(nodes);
  return map;
}

function FileIcon({ name, isDir, isOpen, className }: { name: string; isDir: boolean; isOpen?: boolean; className?: string }) {
  const iconProps = getFileIconProps({ name, isDir, isOpen, className });
  return <img {...iconProps} />;
}

// ===== FileTree Component =====

export const FileTree: React.FC<FileTreeProps> = ({ data, isLoading }) => {
  const { workspaceId, effectiveContextId } = useContextParams();
  const openFile = useEditorStore(s => s.openFile);
  const pinFile = useEditorStore(s => s.pinFile);
  const activeFilePath = useEditorStore((s) => s.getActiveFilePath(effectiveContextId || undefined));
  const currentProjectPath = useEditorStore((s) => s.currentProjectPath);
  const fileTreeRevealTarget = useEditorStore((s) => s.fileTreeRevealTarget);
  const clearFileTreeRevealTarget = useEditorStore((s) => s.clearFileTreeRevealTarget);
  const [highlightedPath, setHighlightedPath] = useState<string | null>(null);
  const [isTreeHighlighted, setIsTreeHighlighted] = useState(false);
  const highlightTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const revealRequestIdRef = React.useRef(0);

  // Calculate initial items map from props.data to avoid render-cycle lag
  const initialItemsMap = useMemo(() => buildItemsMap(data), [data]);
  // Maintain a dynamic map for items loaded on-demand
  const [lazyItemsMap, setLazyItemsMap] = useState<Map<string, FileTreeItem>>(new Map());

  // Clear lazy items when project/workspace context changes to avoid pollution
  useEffect(() => {
    setLazyItemsMap(new Map());
  }, [data]);

  const rootItemIds = useMemo(() => data.map(node => node.path), [data]);

  const loadDirectoryChildren = useCallback(async (itemPath: string): Promise<string[]> => {
    const existingItem = initialItemsMap.get(itemPath) || lazyItemsMap.get(itemPath);
    if (!existingItem?.isDir) return [];

    if (existingItem.children && existingItem.children.length > 0) {
      return existingItem.children;
    }

    const response = await fsApi.listDir(itemPath, { showHidden: true, dirsOnly: false });

    const newChildren = response.entries.map((entry) => entry.path);
    const newEntriesMap = new Map<string, FileTreeItem>();

    response.entries.forEach((entry) => {
      newEntriesMap.set(entry.path, {
        id: entry.path,
        name: entry.name,
        path: entry.path,
        isDir: entry.is_dir,
        isSymlink: entry.is_symlink,
        isIgnored: entry.is_ignored,
        symlinkTarget: entry.symlink_target,
      });
    });

    setLazyItemsMap((prev: Map<string, FileTreeItem>) => {
      const next = new Map(prev);
      newEntriesMap.forEach((val, key) => next.set(key, val));

      const parent = initialItemsMap.get(itemPath) || next.get(itemPath);
      if (parent) {
        next.set(itemPath, { ...parent, children: newChildren });
      }

      return next;
    });

    return newChildren;
  }, [initialItemsMap, lazyItemsMap]);

  const tree = useTree<FileTreeItem>({
    rootItemId: 'root',
    getItemName: (item: ItemInstance<FileTreeItem>) => item.getItemData()?.name ?? '',
    isItemFolder: (item: ItemInstance<FileTreeItem>) => item.getItemData()?.isDir ?? false,
    dataLoader: {
      getItem: (itemId: string): FileTreeItem => {
        if (itemId === 'root') {
          return {
            id: 'root',
            name: 'root',
            path: '',
            isDir: true,
            isSymlink: false,
            isIgnored: false,
            symlinkTarget: undefined,
            children: rootItemIds,
          };
        }
        const item = initialItemsMap.get(itemId) || lazyItemsMap.get(itemId);
        return item || { id: itemId, name: itemId, path: itemId, isDir: false, isSymlink: false, isIgnored: false };
      },
      getChildren: async (itemId: string): Promise<string[]> => {
        if (itemId === 'root') {
          return rootItemIds;
        }

        const item = initialItemsMap.get(itemId) || lazyItemsMap.get(itemId);
        if (!item) return [];

        // If we already have children string IDs, return them
        if (item.children && item.children.length > 0) {
          return item.children;
        }

        // If it's a directory but we don't have children yet, fetch them (on-demand loading)
        if (item.isDir) {
          try {
            return await loadDirectoryChildren(item.path);
          } catch (e) {
            console.error('Failed to load children for', itemId, e);
            return [];
          }
        }

        return [];
      },
    },
    features: [asyncDataLoaderFeature],
  });

  const handleItemClick = useCallback((item: FileTreeItem, isFolder: boolean, toggle: () => void) => {
    if (isFolder) {
      toggle();
    } else {
      // Single click opens in preview mode
      openFile(item.path, effectiveContextId || undefined, { preview: true });
    }
  }, [effectiveContextId, openFile]);

  const handleItemDoubleClick = useCallback((item: FileTreeItem, isFolder: boolean) => {
    if (!isFolder) {
      // Double click pins the file (removes preview mode)
      pinFile(item.path, effectiveContextId || undefined);
    }
  }, [effectiveContextId, pinFile]);

  useEffect(() => {
    if (!fileTreeRevealTarget || !currentProjectPath) return;
    if (fileTreeRevealTarget.workspaceId && fileTreeRevealTarget.workspaceId !== effectiveContextId) return;
    if (
      fileTreeRevealTarget.path !== currentProjectPath &&
      !fileTreeRevealTarget.path.startsWith(`${currentProjectPath}/`)
    ) {
      return;
    }

    let cancelled = false;
    if (highlightTimeoutRef.current) {
      clearTimeout(highlightTimeoutRef.current);
      highlightTimeoutRef.current = null;
    }
    setHighlightedPath(null);
    setIsTreeHighlighted(false);

    const revealTarget = async () => {
      try {
        if (fileTreeRevealTarget.path === currentProjectPath) {
          if (!cancelled) {
            setIsTreeHighlighted(true);
            highlightTimeoutRef.current = setTimeout(() => {
              setIsTreeHighlighted(false);
              highlightTimeoutRef.current = null;
            }, 1800);
          }
          tree.getElement()?.scrollTo({ top: 0, behavior: 'smooth' });
          return;
        }

        const relativePath = fileTreeRevealTarget.path.slice(currentProjectPath.length + 1);
        const segments = relativePath.split('/').filter(Boolean);
        let currentPath = currentProjectPath;
        const revealRequestId = ++revealRequestIdRef.current;

        for (const segment of segments) {
          currentPath = `${currentPath}/${segment}`;
          await loadDirectoryChildren(currentPath);
          if (cancelled || revealRequestIdRef.current !== revealRequestId) {
            return;
          }
          await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
          const item = tree.getItemInstance(currentPath);

          if (item.isFolder() && !item.isExpanded()) {
            item.expand();
            await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
          }
        }

        const targetItem = tree.getItemInstance(fileTreeRevealTarget.path);
        targetItem.setFocused();
        await targetItem.scrollTo({ block: 'center' });

        if (!cancelled) {
          setHighlightedPath(fileTreeRevealTarget.path);
          highlightTimeoutRef.current = setTimeout(() => {
            setHighlightedPath((value) =>
              value === fileTreeRevealTarget.path ? null : value
            );
            highlightTimeoutRef.current = null;
          }, 1800);
        }
      } finally {
        if (!cancelled) {
          clearFileTreeRevealTarget(fileTreeRevealTarget.requestId);
        }
      }
    };

    void revealTarget();

    return () => {
      cancelled = true;
    };
  }, [clearFileTreeRevealTarget, currentProjectPath, effectiveContextId, fileTreeRevealTarget, loadDirectoryChildren, tree]);

  useEffect(() => {
    return () => {
      if (highlightTimeoutRef.current) {
        clearTimeout(highlightTimeoutRef.current);
      }
    };
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="px-4 py-8 text-center">
        <Folder className="size-8 mx-auto text-muted-foreground mb-2 opacity-50" />
        <p className="text-muted-foreground text-xs text-pretty italic">
          No files found
        </p>
      </div>
    );
  }

  const items = tree.getItems();

  return (
    <div
      // eslint-disable-next-line react-hooks/refs
      ref={tree.registerElement}
      // eslint-disable-next-line react-hooks/refs
      {...tree.getContainerProps('File tree')}
      className={cn(
        "text-sm rounded-md transition-colors",
        isTreeHighlighted && "bg-sidebar-accent/35"
      )}
    >
      {items.map((item) => {
        const itemData = item.getItemData();
        if (!itemData) return null;

        const isFolder = item.isFolder();
        const isExpanded = item.isExpanded();
        const isActive = activeFilePath === itemData.path;
        const isHighlighted = highlightedPath === itemData.path;
        const depth = item.getItemMeta().level;

        const toggle = async () => {
          if (isExpanded) {
            item.collapse();
          } else {
            // Ensure children are loaded before expanding if we're doing on-demand
            if (!itemData.children && itemData.isDir) {
              // Headless tree handles the loading state via asyncDataLoaderFeature
            }
            item.expand();
          }
        };

        return (
          <div
            key={item.getId()}
            ref={item.registerElement}
            {...item.getProps()}
            onClick={() => handleItemClick(itemData, isFolder, toggle)}
            onDoubleClick={() => handleItemDoubleClick(itemData, isFolder)}
            className={cn(
              'flex items-center py-1 px-2 cursor-pointer select-none rounded-sm transition-colors outline-none',
              'hover:bg-sidebar-accent/50',
              isActive && 'bg-sidebar-accent text-sidebar-foreground',
              isHighlighted && !isActive && 'bg-sidebar-accent/70 text-sidebar-foreground',
              itemData.isIgnored && !isActive && 'opacity-40 grayscale-[0.5]',
              'focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-1'
            )}
            style={{ paddingLeft: `${depth * 12 + 8}px` }}
          >
            {isFolder && (
              <ChevronRight
                className={cn(
                  'size-3.5 mr-1 transition-transform duration-200 text-muted-foreground',
                  isExpanded && 'rotate-90'
                )}
              />
            )}
            {!isFolder && <span className="w-[18px]" />}
            <span className="mr-2 shrink-0">
              <FileIcon
                name={itemData.name}
                isDir={isFolder}
                isOpen={isExpanded}
                className="size-4"
              />
            </span>
            <span className="text-[13px] truncate flex-1">
              {itemData.name}
            </span>
            {itemData.isSymlink && (
              <span className="ml-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                <Tooltip delayDuration={0}>
                  <TooltipTrigger asChild>
                    <CornerUpRight className="size-3 text-muted-foreground/60" />
                  </TooltipTrigger>
                  <TooltipContent side="right" className="max-w-[300px] break-all">
                    <p className="text-[11px] leading-tight">
                      <span className="mr-1">Points to:</span>
                      {itemData.symlinkTarget || 'Unknown'}
                    </p>
                  </TooltipContent>
                </Tooltip>
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default FileTree;
