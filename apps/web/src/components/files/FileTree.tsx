'use client';

import React, { useMemo, useCallback, useState, useEffect } from 'react';
import { useTree } from '@headless-tree/react';
import { asyncDataLoaderFeature } from '@headless-tree/core';
import type { ItemInstance } from '@headless-tree/core';
import { cn, Loader2, Folder, toastManager } from '@workspace/ui';
import { FileTreeNode, fsApi } from '@/api/ws-api';
import { useEditorStore } from '@/hooks/use-editor-store';
import { useContextParams } from "@/hooks/use-context-params";
import {
  buildDuplicateName,
  buildItemsMap,
  getBaseName,
  getParentPath,
  getRenameSelectionEnd,
  joinPath,
  type FileTreeItem,
  type FileTreeMenuState,
  type PendingPanelState,
} from './file-tree-utils';
import { FileTreeContextMenu } from './FileTreeContextMenu';
import { FileTreeRow } from './FileTreeRow';

interface FileTreeProps {
  data: FileTreeNode[];
  rootPath: string | null;
  isLoading?: boolean;
  onRefresh?: () => Promise<void> | void;
  /** Runs synchronously before opening a file from the tree (e.g. close ancestor Popovers). */
  beforeOpenFile?: () => void;
}

export const FileTree: React.FC<FileTreeProps> = ({
  data,
  rootPath,
  isLoading,
  onRefresh,
  beforeOpenFile,
}) => {
  const { effectiveContextId } = useContextParams();
  const openFile = useEditorStore((s) => s.openFile);
  const pinFile = useEditorStore((s) => s.pinFile);
  const activeFilePath = useEditorStore((s) =>
    s.getActiveFilePath(effectiveContextId || undefined),
  );
  const currentProjectPath = useEditorStore((s) => s.currentProjectPath);
  const fileTreeRevealTarget = useEditorStore((s) => s.fileTreeRevealTarget);
  const clearFileTreeRevealTarget = useEditorStore((s) => s.clearFileTreeRevealTarget);
  const replaceOpenFilePath = useEditorStore((s) => s.replaceOpenFilePath);
  const closeFilesByPrefix = useEditorStore((s) => s.closeFilesByPrefix);

  const [highlightedPath, setHighlightedPath] = useState<string | null>(null);
  const [isTreeHighlighted, setIsTreeHighlighted] = useState(false);
  const [menuState, setMenuState] = useState<FileTreeMenuState | null>(null);
  const [panelState, setPanelState] = useState<PendingPanelState>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [panelName, setPanelName] = useState('');
  const [isMutating, setIsMutating] = useState(false);
  const panelInputRef = React.useRef<HTMLInputElement | null>(null);
  const renameSelectionAppliedRef = React.useRef(false);

  const highlightTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const revealRequestIdRef = React.useRef(0);

  const initialItemsMap = useMemo(() => buildItemsMap(data), [data]);
  const [lazyItemsMap, setLazyItemsMap] = useState<Map<string, FileTreeItem>>(new Map());
  const rootItemIds = useMemo(() => data.map((node) => node.path), [data]);

  useEffect(() => {
    // Reset lazily-loaded entries only when the project root itself
    // changes. Resetting on every `data` update (e.g. show-hidden toggle
    // or refresh) would orphan already-expanded deep directories, since
    // they live exclusively in this map (not in `initialItemsMap`).
    setLazyItemsMap(new Map());
  }, [rootPath]);

  const loadDirectoryChildren = useCallback(async (itemPath: string): Promise<string[]> => {
    const existingItem = initialItemsMap.get(itemPath) || lazyItemsMap.get(itemPath);
    if (!existingItem?.isDir) return [];

    if (existingItem.children && existingItem.children.length > 0) {
      return existingItem.children;
    }

    const response = await fsApi.listDir(itemPath, { showHidden: true, dirsOnly: false });
    const newChildren = response.entries.map((entry) => entry.path);
    const newEntriesMap = new Map<string, FileTreeItem>();

    // If the parent directory is gitignored, every descendant is effectively
    // ignored too. The backend's per-directory gitignore check can't see that
    // because an ignored directory's own contents aren't separately covered
    // by any rule — the rule lives on the ancestor. Propagate the flag here
    // so the UI can dim the entire subtree consistently.
    const parentIgnored = existingItem.isIgnored;

    response.entries.forEach((entry) => {
      newEntriesMap.set(entry.path, {
        id: entry.path,
        name: entry.name,
        path: entry.path,
        isDir: entry.is_dir,
        isSymlink: entry.is_symlink,
        isIgnored: entry.is_ignored || parentIgnored,
        symlinkTarget: entry.symlink_target,
      });
    });

    setLazyItemsMap((prev) => {
      const next = new Map(prev);
      newEntriesMap.forEach((value, key) => next.set(key, value));

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
        return item || {
          id: itemId,
          name: itemId,
          path: itemId,
          isDir: false,
          isSymlink: false,
          isIgnored: false,
        };
      },
      getChildren: async (itemId: string): Promise<string[]> => {
        if (itemId === 'root') return rootItemIds;

        const item = initialItemsMap.get(itemId) || lazyItemsMap.get(itemId);
        if (!item) return [];
        if (item.children && item.children.length > 0) return item.children;
        if (item.isDir) {
          try {
            return await loadDirectoryChildren(item.path);
          } catch (error) {
            console.error('Failed to load children for', itemId, error);
            return [];
          }
        }
        return [];
      },
    },
    features: [asyncDataLoaderFeature],
  });

  // The async data loader caches children IDs keyed by itemId, so simply
  // updating the `data` prop (e.g. after toggling show-hidden or
  // refreshing) would otherwise keep the UI pinned to the previously
  // cached tree structure. Re-running the dataLoader closures via
  // invalidate picks up the latest `data`.
  //
  // Only invalidate children IDs — not item data — because the store's
  // fetch briefly sets `data` to `[]` mid-refresh, during which
  // `initialItemsMap` is empty and `getItem(path)` would otherwise cache
  // the fallback `{ name: path, isDir: false }` placeholder for every
  // item, flattening the tree once real data arrives.
  useEffect(() => {
    void tree.getRootItem().invalidateChildrenIds(true);
    for (const item of tree.getItems()) {
      if (item.isFolder()) {
        void item.invalidateChildrenIds(true);
      }
    }
  }, [data, tree]);

  const handleRefresh = useCallback(async () => {
    await onRefresh?.();
  }, [onRefresh]);

  const closePanel = useCallback(() => {
    setPanelState(null);
    setPanelName('');
  }, []);

  const closeOverlays = useCallback(() => {
    setMenuState(null);
    setDeleteConfirmOpen(false);
    closePanel();
  }, [closePanel]);

  const handleItemClick = useCallback((item: FileTreeItem, isFolder: boolean, toggle: () => void) => {
    if (isFolder) {
      toggle();
    } else {
      beforeOpenFile?.();
      openFile(item.path, effectiveContextId || undefined, { preview: true });
    }
  }, [beforeOpenFile, effectiveContextId, openFile]);

  const handleItemDoubleClick = useCallback((item: FileTreeItem, isFolder: boolean) => {
    if (!isFolder) {
      pinFile(item.path, effectiveContextId || undefined);
    }
  }, [effectiveContextId, pinFile]);

  const selectedItem = menuState
    ? initialItemsMap.get(menuState.itemPath) || lazyItemsMap.get(menuState.itemPath) || null
    : null;

  const relativePath = selectedItem && rootPath
    ? selectedItem.path === rootPath
      ? '.'
      : selectedItem.path.startsWith(`${rootPath}/`)
        ? selectedItem.path.slice(rootPath.length + 1)
        : selectedItem.path
    : null;

  const openCreatePanel = (mode: 'create-file' | 'create-folder') => {
    if (!selectedItem) return;
    const parentPath = selectedItem.isDir ? selectedItem.path : getParentPath(selectedItem.path);
    setPanelState({
      mode,
      targetPath: parentPath,
      parentPath,
      initialName: '',
      title: mode === 'create-file' ? 'New File' : 'New Folder',
      description:
        mode === 'create-file'
          ? `Create a new file in ${getBaseName(parentPath)}.`
          : `Create a new folder in ${getBaseName(parentPath)}.`,
      confirmLabel: mode === 'create-file' ? 'Create File' : 'Create Folder',
    });
    setPanelName('');
  };

  const openRenamePanel = () => {
    if (!selectedItem) return;
    setPanelState({
      mode: 'rename',
      targetPath: selectedItem.path,
      parentPath: getParentPath(selectedItem.path),
      initialName: selectedItem.name,
      title: 'Rename',
      description: `Rename ${selectedItem.name}.`,
      confirmLabel: 'Rename',
    });
    setPanelName(selectedItem.name);
  };

  const handleDuplicate = useCallback(async () => {
    if (!selectedItem) return;
    const duplicateName = buildDuplicateName(selectedItem.name, selectedItem.isDir);
    const destination = joinPath(getParentPath(selectedItem.path), duplicateName);

    try {
      setIsMutating(true);
      await fsApi.duplicatePath(selectedItem.path, destination);
      await handleRefresh();
      toastManager.add({
        title: 'Duplicated',
        description: `${selectedItem.name} duplicated.`,
        type: 'success',
      });
    } catch (error) {
      console.error('Failed to duplicate path:', error);
      toastManager.add({
        title: 'Duplicate failed',
        description: `Could not duplicate ${selectedItem.name}.`,
        type: 'error',
      });
    } finally {
      setIsMutating(false);
      setMenuState(null);
    }
  }, [handleRefresh, selectedItem]);

  const handleDelete = useCallback(async () => {
    if (!selectedItem) return;

    try {
      setIsMutating(true);
      await fsApi.deletePath(selectedItem.path);
      closeFilesByPrefix(selectedItem.path, effectiveContextId || undefined);
      await handleRefresh();
      toastManager.add({
        title: 'Success',
        description: 'Deleted successfully.',
        type: 'success',
      });
      closeOverlays();
    } catch (error) {
      console.error('Failed to delete path:', error);
      toastManager.add({
        title: 'Delete failed',
        description: error instanceof Error ? error.message : `Could not delete ${selectedItem.name}.`,
        type: 'error',
      });
    } finally {
      setIsMutating(false);
    }
  }, [closeFilesByPrefix, closeOverlays, effectiveContextId, handleRefresh, selectedItem]);

  const submitPanel = useCallback(async () => {
    if (!panelState) return;

    const trimmedName = panelName.trim();
    if (!trimmedName) {
      toastManager.add({
        title: 'Name required',
        description: 'Please enter a name.',
        type: 'warning',
      });
      return;
    }

    try {
      setIsMutating(true);

      if (panelState.mode === 'create-file') {
        const nextPath = joinPath(panelState.parentPath, trimmedName);
        await fsApi.writeFile(nextPath, '');
        await handleRefresh();
        await openFile(nextPath, effectiveContextId || undefined, { preview: false });
      } else if (panelState.mode === 'create-folder') {
        await fsApi.createDir(joinPath(panelState.parentPath, trimmedName));
        await handleRefresh();
      } else if (panelState.mode === 'rename') {
        const nextPath = joinPath(panelState.parentPath, trimmedName);
        await fsApi.renamePath(panelState.targetPath, nextPath);
        replaceOpenFilePath(panelState.targetPath, nextPath, effectiveContextId || undefined);
        await handleRefresh();
      }

      toastManager.add({
        title: 'Success',
        description:
          panelState.mode === 'create-file'
            ? 'File created.'
            : panelState.mode === 'create-folder'
              ? 'Folder created.'
              : 'Renamed successfully.',
        type: 'success',
      });
      closePanel();
      setMenuState(null);
    } catch (error) {
      console.error('File tree action failed:', error);
      toastManager.add({
        title: 'Action failed',
        description: error instanceof Error ? error.message : 'Operation failed.',
        type: 'error',
      });
    } finally {
      setIsMutating(false);
    }
  }, [
    closePanel,
    effectiveContextId,
    handleRefresh,
    openFile,
    panelName,
    panelState,
    replaceOpenFilePath,
  ]);

  const applyRenameSelection = React.useCallback((input: HTMLInputElement | null) => {
    if (!input || !panelState || panelState.mode !== 'rename') return;

    const originalName = panelState.initialName;
    if (!originalName) {
      input.select();
      return;
    }

    input.setSelectionRange(
      0,
      getRenameSelectionEnd(originalName, Boolean(selectedItem?.isDir)),
    );
  }, [panelState, selectedItem]);

  const handlePanelInputKeyDown = useCallback((event: React.KeyboardEvent<HTMLInputElement>) => {
    event.stopPropagation();
    if (event.key === 'Enter') {
      event.preventDefault();
      void submitPanel();
    }
  }, [submitPanel]);

  useEffect(() => {
    renameSelectionAppliedRef.current = false;
    if (!panelState) return;
    requestAnimationFrame(() => {
      const input = panelInputRef.current;
      input?.focus({ preventScroll: true });
      if (panelState.mode === 'rename' && input) {
        const selectionEnd = getRenameSelectionEnd(
          panelState.initialName,
          Boolean(selectedItem?.isDir),
        );
        input.setSelectionRange(0, selectionEnd);
        renameSelectionAppliedRef.current = true;
      }
    });
  }, [panelState, selectedItem]);

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

        const relative = fileTreeRevealTarget.path.slice(currentProjectPath.length + 1);
        const segments = relative.split('/').filter(Boolean);
        let currentPath = currentProjectPath;
        const revealRequestId = ++revealRequestIdRef.current;

        for (const segment of segments) {
          currentPath = `${currentPath}/${segment}`;
          await loadDirectoryChildren(currentPath);
          if (cancelled || revealRequestIdRef.current !== revealRequestId) return;
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
              value === fileTreeRevealTarget.path ? null : value,
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
  }, [
    clearFileTreeRevealTarget,
    currentProjectPath,
    effectiveContextId,
    fileTreeRevealTarget,
    loadDirectoryChildren,
    tree,
  ]);

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
    <>
      <div
        ref={tree.registerElement}
        {...tree.getContainerProps('File tree')}
        className={cn(
          'text-sm rounded-md transition-colors',
          isTreeHighlighted && 'bg-sidebar-accent/35',
        )}
      >
        {items.map((item) => {
          const itemData = item.getItemData();
          if (!itemData) return null;

          const isActive = activeFilePath === itemData.path;
          const isContextTarget = menuState?.itemPath === itemData.path;
          const isHighlighted = highlightedPath === itemData.path;

          return (
            <FileTreeRow
              key={item.getId()}
              item={item}
              itemData={itemData}
              isActive={isActive}
              isContextTarget={isContextTarget}
              isHighlighted={isHighlighted}
              onClick={handleItemClick}
              onDoubleClick={handleItemDoubleClick}
              onContextMenu={(event, itemPath) => {
                event.preventDefault();
                setMenuState({ x: event.clientX, y: event.clientY, itemPath });
              }}
            />
          );
        })}
      </div>

      <FileTreeContextMenu
        menuState={menuState}
        selectedItem={selectedItem}
        relativePath={relativePath}
        panelState={panelState}
        panelName={panelName}
        panelInputRef={panelInputRef}
        renameSelectionAppliedRef={renameSelectionAppliedRef}
        isMutating={isMutating}
        deleteConfirmOpen={deleteConfirmOpen}
        setPanelName={setPanelName}
        setDeleteConfirmOpen={setDeleteConfirmOpen}
        closePanel={closePanel}
        closeOverlays={closeOverlays}
        closeMenu={() => setMenuState(null)}
        openCreatePanel={openCreatePanel}
        openRenamePanel={openRenamePanel}
        handleDuplicate={handleDuplicate}
        handleDelete={handleDelete}
        submitPanel={submitPanel}
        handlePanelInputKeyDown={handlePanelInputKeyDown}
        applyRenameSelection={applyRenameSelection}
      />
    </>
  );
};

export default FileTree;
