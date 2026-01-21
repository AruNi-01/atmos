'use client';

import React, { useMemo, useCallback, useEffect } from 'react';
import { useTree } from '@headless-tree/react';
import { syncDataLoaderFeature } from '@headless-tree/core';
import type { ItemInstance } from '@headless-tree/core';
import { cn, ChevronRight, File, Folder, FolderOpen, Loader2 } from '@workspace/ui';
import { FileTreeNode } from '@/api/ws-api';
import { useEditorStore } from '@/hooks/use-editor-store';

// ===== Types =====

interface FileTreeItem {
  id: string;
  name: string;
  path: string;
  isDir: boolean;
  children?: string[];
}

interface FileTreeProps {
  data: FileTreeNode[];
  isLoading?: boolean;
}

// ===== Helper Functions =====

// Build a flat map of all items from the tree data
function buildItemsMap(nodes: FileTreeNode[]): Map<string, FileTreeItem> {
  const map = new Map<string, FileTreeItem>();

  function traverse(nodes: FileTreeNode[]) {
    for (const node of nodes) {
      const item: FileTreeItem = {
        id: node.path,
        name: node.name,
        path: node.path,
        isDir: node.is_dir,
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

// Get file icon based on extension
function getFileIcon(name: string, isDir: boolean, isExpanded: boolean) {
  if (isDir) {
    return isExpanded ? (
      <FolderOpen className="size-4 text-amber-500" />
    ) : (
      <Folder className="size-4 text-amber-500" />
    );
  }

  const ext = name.split('.').pop()?.toLowerCase();

  // Color based on file type
  let iconColor = 'text-muted-foreground';

  if (['ts', 'tsx'].includes(ext || '')) {
    iconColor = 'text-blue-500';
  } else if (['js', 'jsx', 'mjs'].includes(ext || '')) {
    iconColor = 'text-yellow-500';
  } else if (['rs'].includes(ext || '')) {
    iconColor = 'text-orange-500';
  } else if (['json'].includes(ext || '')) {
    iconColor = 'text-yellow-600';
  } else if (['md', 'mdx'].includes(ext || '')) {
    iconColor = 'text-blue-400';
  } else if (['css', 'scss', 'less'].includes(ext || '')) {
    iconColor = 'text-pink-500';
  } else if (['html'].includes(ext || '')) {
    iconColor = 'text-orange-400';
  } else if (['py'].includes(ext || '')) {
    iconColor = 'text-green-500';
  } else if (['go'].includes(ext || '')) {
    iconColor = 'text-cyan-500';
  }

  return <File className={cn('size-4', iconColor)} />;
}

// ===== FileTree Component =====

export const FileTree: React.FC<FileTreeProps> = ({ data, isLoading }) => {
  const { openFile, activeFilePath } = useEditorStore();

  // Build items map from data
  const itemsMap = useMemo(() => buildItemsMap(data), [data]);
  const rootItemIds = useMemo(() => data.map(node => node.path), [data]);

  // Create tree instance
  const tree = useTree<FileTreeItem>({
    rootItemId: 'root',
    getItemName: (item: ItemInstance<FileTreeItem>) => item.getItemData().name,
    isItemFolder: (item: ItemInstance<FileTreeItem>) => item.getItemData().isDir,
    dataLoader: {
      getItem: (itemId: string): FileTreeItem => {
        if (itemId === 'root') {
          return {
            id: 'root',
            name: 'root',
            path: '',
            isDir: true,
            children: rootItemIds,
          };
        }
        const item = itemsMap.get(itemId);
        return item || { id: itemId, name: itemId, path: itemId, isDir: false };
      },
      getChildren: (itemId: string): string[] => {
        if (itemId === 'root') {
          return rootItemIds;
        }
        const item = itemsMap.get(itemId);
        return item?.children || [];
      },
    },
    features: [syncDataLoaderFeature],
  });



  // Handle item click
  const handleItemClick = useCallback((item: FileTreeItem, isFolder: boolean, toggle: () => void) => {
    if (isFolder) {
      toggle();
    } else {
      openFile(item.path);
    }
  }, [openFile]);

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
      ref={tree.registerElement}
      {...tree.getContainerProps('File tree')}
      className="text-sm"
    >
      {items.map((item) => {
        const itemData = item.getItemData();
        const isFolder = item.isFolder();
        const isExpanded = item.isExpanded();
        const isActive = activeFilePath === itemData.path;
        const depth = item.getItemMeta().level;

        const toggle = () => {
          if (isExpanded) {
            item.collapse();
          } else {
            item.expand();
          }
        };

        return (
          <div
            key={item.getId()}
            ref={item.registerElement}
            {...item.getProps()}
            onClick={() => handleItemClick(itemData, isFolder, toggle)}
            className={cn(
              'flex items-center py-1 px-2 cursor-pointer select-none rounded-sm transition-colors outline-none',
              'hover:bg-sidebar-accent/50',
              isActive && 'bg-sidebar-accent text-sidebar-foreground',
              // Only show focus ring when using keyboard (focus-visible)
              'focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-1'
            )}
            style={{ paddingLeft: `${depth * 12 + 8}px` }}
          >
            {/* Expand/Collapse Icon for folders */}
            {isFolder && (
              <ChevronRight
                className={cn(
                  'size-3.5 mr-1 transition-transform duration-200 text-muted-foreground',
                  isExpanded && 'rotate-90'
                )}
              />
            )}

            {/* Spacer for files (to align with folders) */}
            {!isFolder && <span className="w-[18px]" />}

            {/* File/Folder Icon */}
            <span className="mr-2 shrink-0">
              {getFileIcon(itemData.name, isFolder, isExpanded)}
            </span>

            {/* Name */}
            <span className="text-[13px] truncate">
              {itemData.name}
            </span>
          </div>
        );
      })}
    </div>
  );
};

export default FileTree;
