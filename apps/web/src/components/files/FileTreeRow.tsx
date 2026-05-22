'use client';

/* eslint-disable react-hooks/refs -- Headless Tree exposes registerElement/getProps as render-time row bindings. */

import React from 'react';
import type { ItemInstance } from '@headless-tree/core';
import {
  cn,
  getFileIconProps,
  ChevronRight,
  CornerUpRight,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@workspace/ui';
import type { FileTreeItem } from './file-tree-utils';

function FileIcon({
  name,
  isDir,
  isOpen,
  className,
}: {
  name: string;
  isDir: boolean;
  isOpen?: boolean;
  className?: string;
}) {
  const iconProps = getFileIconProps({ name, isDir, isOpen, className });
  // eslint-disable-next-line @next/next/no-img-element -- file icons are tiny decorative assets from the UI package.
  return <img {...iconProps} alt="" />;
}

interface FileTreeRowProps {
  item: ItemInstance<FileTreeItem>;
  itemData: FileTreeItem;
  isActive: boolean;
  isContextTarget: boolean;
  isHighlighted: boolean;
  onClick: (
    item: FileTreeItem,
    isFolder: boolean,
    toggle: () => void | Promise<void>,
  ) => void;
  onDoubleClick: (item: FileTreeItem, isFolder: boolean) => void;
  onContextMenu: (event: React.MouseEvent<HTMLDivElement>, itemPath: string) => void;
}

export function FileTreeRow({
  item,
  itemData,
  isActive,
  isContextTarget,
  isHighlighted,
  onClick,
  onDoubleClick,
  onContextMenu,
}: FileTreeRowProps) {
  const isFolder = item.isFolder();
  const isExpanded = item.isExpanded();
  const depth = item.getItemMeta().level;

  const toggle = async () => {
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
      onClick={() => onClick(itemData, isFolder, toggle)}
      onDoubleClick={() => onDoubleClick(itemData, isFolder)}
      onContextMenu={(event) => onContextMenu(event, itemData.path)}
      className={cn(
        'flex items-center py-1 px-2 cursor-pointer select-none rounded-sm transition-colors outline-none',
        'hover:bg-sidebar-accent/50',
        (isActive || isContextTarget) && 'bg-sidebar-accent text-sidebar-foreground',
        isHighlighted && !isActive && 'bg-sidebar-accent/70 text-sidebar-foreground',
        itemData.isIgnored && !isActive && 'opacity-40 grayscale-[0.5]',
        'focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-1',
      )}
      style={{ paddingLeft: `${depth * 12 + 8}px` }}
    >
      {isFolder ? (
        <ChevronRight
          className={cn(
            'size-3.5 mr-1 transition-transform duration-200 text-muted-foreground',
            isExpanded && 'rotate-90',
          )}
        />
      ) : (
        <span className="w-[18px]" />
      )}
      <span className="mr-2 shrink-0">
        <FileIcon
          name={itemData.name}
          isDir={isFolder}
          isOpen={isExpanded}
          className="size-4"
        />
      </span>
      <span className="text-[13px] truncate flex-1">{itemData.name}</span>
      {itemData.isSymlink && (
        <span className="ml-1 shrink-0" onClick={(event) => event.stopPropagation()}>
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
}
