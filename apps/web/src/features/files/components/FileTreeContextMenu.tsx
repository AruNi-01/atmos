'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import {
  cn,
  Loader2,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Button,
  Input,
  toastManager,
} from '@workspace/ui';
import {
  FilePlus2,
  FolderPlus,
  Pencil,
  Trash2,
  Copy,
  ExternalLink,
  Files,
} from 'lucide-react';
import { appApi } from '@/api/ws-api';
import {
  QUICK_OPEN_APP_MAP,
  type QuickOpenAppName,
} from '@/app-shell/quick-open-apps';
import { readQuickOpenLastUsed } from '@/shared/stores/use-ui-pref-hooks';
import {
  copyToClipboard,
  getBaseName,
  type FileTreeItem,
  type FileTreeMenuState,
  type PendingPanelMode,
  type PendingPanelState,
} from '../lib/file-tree-utils';

interface FileTreeContextMenuProps {
  menuState: FileTreeMenuState | null;
  selectedItem: FileTreeItem | null;
  relativePath: string | null;
  anchorPosition?: 'fixed' | 'absolute';
  panelState: PendingPanelState;
  panelName: string;
  panelInputRef: React.RefObject<HTMLInputElement | null>;
  renameSelectionAppliedRef: React.RefObject<boolean>;
  isMutating: boolean;
  deleteConfirmOpen: boolean;
  setPanelName: (name: string) => void;
  setDeleteConfirmOpen: (open: boolean | ((current: boolean) => boolean)) => void;
  closePanel: () => void;
  closeOverlays: () => void;
  closeMenu: () => void;
  openCreatePanel: (mode: Exclude<PendingPanelMode, 'rename'>) => void;
  openRenamePanel: () => void;
  handleDuplicate: () => Promise<void>;
  handleDelete: () => Promise<void>;
  submitPanel: () => Promise<void>;
  handlePanelInputKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void;
  applyRenameSelection: (input: HTMLInputElement | null) => void;
}

export function FileTreeContextMenu({
  menuState,
  selectedItem,
  relativePath,
  anchorPosition = 'fixed',
  panelState,
  panelName,
  panelInputRef,
  renameSelectionAppliedRef,
  isMutating,
  deleteConfirmOpen,
  setPanelName,
  setDeleteConfirmOpen,
  closePanel,
  closeOverlays,
  closeMenu,
  openCreatePanel,
  openRenamePanel,
  handleDuplicate,
  handleDelete,
  submitPanel,
  handlePanelInputKeyDown,
  applyRenameSelection,
}: FileTreeContextMenuProps) {
  const t = useTranslations('files.components');
  return (
    <DropdownMenu
      open={!!menuState}
      onOpenChange={(open) => {
        if (!open) {
          closeOverlays();
        }
      }}
    >
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-hidden
          className={cn(
            'size-0 pointer-events-none',
            anchorPosition === 'fixed' ? 'fixed' : 'absolute',
          )}
          style={{
            left: menuState?.x ?? -9999,
            top: menuState?.y ?? -9999,
          }}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={4} className="w-64">
        {selectedItem ? (
          <>
            <DropdownMenuSub
              open={panelState?.mode === 'create-file'}
              onOpenChange={(open) => {
                if (open) {
                  openCreatePanel('create-file');
                } else if (panelState?.mode === 'create-file') {
                  closePanel();
                }
              }}
            >
              <DropdownMenuSubTrigger>
                <FilePlus2 />
                {t('fileTreeContextMenu.actions.newFile')}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-80 p-3">
                <div className="space-y-3">
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-foreground">
                      {panelState?.title ?? t('fileTreeContextMenu.panels.newFile.title')}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {panelState?.description ?? t('fileTreeContextMenu.panels.newFile.description', { name: getBaseName(selectedItem.path) })}
                    </p>
                  </div>
                  <Input
                    ref={panelInputRef}
                    value={panelName}
                    onChange={(event) => setPanelName(event.target.value)}
                    placeholder={t('fileTreeContextMenu.panels.newFile.placeholder')}
                    onKeyDown={handlePanelInputKeyDown}
                  />
                  <div className="flex items-center justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isMutating}
                      onClick={closePanel}
                    >
                      {t('fileTreeContextMenu.actions.cancel')}
                    </Button>
                    <Button size="sm" disabled={isMutating} onClick={() => void submitPanel()}>
                      {isMutating ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                      {t('fileTreeContextMenu.actions.create')}
                    </Button>
                  </div>
                </div>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSub
              open={panelState?.mode === 'create-folder'}
              onOpenChange={(open) => {
                if (open) {
                  openCreatePanel('create-folder');
                } else if (panelState?.mode === 'create-folder') {
                  closePanel();
                }
              }}
            >
              <DropdownMenuSubTrigger>
                <FolderPlus />
                {t('fileTreeContextMenu.actions.newFolder')}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-80 p-3">
                <div className="space-y-3">
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-foreground">
                      {panelState?.title ?? t('fileTreeContextMenu.panels.newFolder.title')}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {panelState?.description ?? t('fileTreeContextMenu.panels.newFolder.description', { name: getBaseName(selectedItem.path) })}
                    </p>
                  </div>
                  <Input
                    ref={panelInputRef}
                    value={panelName}
                    onChange={(event) => setPanelName(event.target.value)}
                    placeholder={t('fileTreeContextMenu.panels.newFolder.placeholder')}
                    onKeyDown={handlePanelInputKeyDown}
                  />
                  <div className="flex items-center justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isMutating}
                      onClick={closePanel}
                    >
                      {t('fileTreeContextMenu.actions.cancel')}
                    </Button>
                    <Button size="sm" disabled={isMutating} onClick={() => void submitPanel()}>
                      {isMutating ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                      {t('fileTreeContextMenu.actions.create')}
                    </Button>
                  </div>
                </div>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={async () => {
                try {
                  const saved = readQuickOpenLastUsed();
                  const appName =
                    saved && Object.prototype.hasOwnProperty.call(QUICK_OPEN_APP_MAP, saved)
                      ? (saved as QuickOpenAppName)
                      : 'Finder';
                  await appApi.openWith(appName, selectedItem.path);
                } catch (error) {
                  console.error('Failed to open in default app:', error);
                  toastManager.add({
                    title: t('fileTreeContextMenu.toast.openFailedTitle'),
                    description: t('fileTreeContextMenu.toast.openFailedDescription'),
                    type: 'error',
                  });
                } finally {
                  closeMenu();
                }
              }}
            >
              <ExternalLink />
              {t('fileTreeContextMenu.actions.openInDefaultApp')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleDuplicate} disabled={isMutating}>
              <Files />
              {t('fileTreeContextMenu.actions.duplicate')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={async () => {
                await copyToClipboard(selectedItem.path, t('fileTreeContextMenu.toast.pathCopied'));
                closeMenu();
              }}
            >
              <Copy />
              {t('fileTreeContextMenu.actions.copyPath')}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={async () => {
                await copyToClipboard(relativePath || selectedItem.path, t('fileTreeContextMenu.toast.relativePathCopied'));
                closeMenu();
              }}
            >
              <Copy />
              {t('fileTreeContextMenu.actions.copyRelativePath')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuSub
              open={panelState?.mode === 'rename'}
              onOpenChange={(open) => {
                if (open) {
                  openRenamePanel();
                } else if (panelState?.mode === 'rename') {
                  closePanel();
                }
              }}
            >
              <DropdownMenuSubTrigger>
                <Pencil />
                {t('fileTreeContextMenu.actions.rename')}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-80 p-3">
                <div className="space-y-3">
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-foreground">
                      {panelState?.title ?? t('fileTreeContextMenu.panels.rename.title')}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {panelState?.description ?? t('fileTreeContextMenu.panels.rename.description', { name: selectedItem.name })}
                    </p>
                  </div>
                  <Input
                    ref={panelInputRef}
                    value={panelName}
                    onChange={(event) => setPanelName(event.target.value)}
                    placeholder={t('fileTreeContextMenu.panels.rename.placeholder')}
                    onFocus={(event) => {
                      if (panelState?.mode !== 'rename') return;
                      if (!renameSelectionAppliedRef.current) {
                        applyRenameSelection(event.currentTarget);
                        renameSelectionAppliedRef.current = true;
                      }
                    }}
                    onKeyDown={handlePanelInputKeyDown}
                  />
                  <div className="flex items-center justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isMutating}
                      onClick={closePanel}
                    >
                      {t('fileTreeContextMenu.actions.cancel')}
                    </Button>
                    <Button size="sm" disabled={isMutating} onClick={() => void submitPanel()}>
                      {isMutating ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                      {t('fileTreeContextMenu.actions.rename')}
                    </Button>
                  </div>
                </div>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <Popover open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  disabled={isMutating}
                  className={cn(
                    'relative flex w-full cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none',
                    'text-destructive hover:bg-accent/60 focus:bg-accent focus:text-destructive data-[state=open]:bg-accent data-[state=open]:text-destructive disabled:pointer-events-none disabled:opacity-50',
                  )}
                  onPointerMove={() => {
                    if (panelState?.mode === 'rename') {
                      closePanel();
                    }
                  }}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    closePanel();
                    setDeleteConfirmOpen((current) => !current);
                  }}
                >
                  <Trash2 className="size-4 shrink-0" />
                  {t('fileTreeContextMenu.actions.delete')}
                </button>
              </PopoverTrigger>
              <PopoverContent
                side="right"
                align="start"
                sideOffset={8}
                className="w-72 border-border bg-popover p-3 shadow-lg"
                onOpenAutoFocus={(event) => event.preventDefault()}
                onClick={(event) => event.stopPropagation()}
              >
                <div className="space-y-3">
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-foreground">
                      {selectedItem?.isDir
                        ? t('fileTreeContextMenu.deleteConfirm.deleteFolderTitle')
                        : t('fileTreeContextMenu.deleteConfirm.deleteFileTitle')}
                    </p>
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      {selectedItem?.isDir
                        ? t('fileTreeContextMenu.deleteConfirm.deleteFolderDescription', { name: selectedItem.name })
                        : t('fileTreeContextMenu.deleteConfirm.deleteFileDescription', { name: selectedItem?.name ?? '' })}
                    </p>
                  </div>
                  <div className="flex items-center justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isMutating}
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        closeOverlays();
                      }}
                    >
                      {t('fileTreeContextMenu.actions.cancel')}
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={isMutating}
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        void handleDelete();
                      }}
                    >
                      {isMutating ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                      {t('fileTreeContextMenu.actions.delete')}
                    </Button>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
