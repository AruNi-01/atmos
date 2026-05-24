'use client';

import React from 'react';
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
          className="fixed size-0 pointer-events-none"
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
                New File
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-80 p-3">
                <div className="space-y-3">
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-foreground">
                      {panelState?.title ?? 'New File'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {panelState?.description ?? `Create a new file in ${getBaseName(selectedItem.path)}.`}
                    </p>
                  </div>
                  <Input
                    ref={panelInputRef}
                    value={panelName}
                    onChange={(event) => setPanelName(event.target.value)}
                    placeholder="Enter file name"
                    onKeyDown={handlePanelInputKeyDown}
                  />
                  <div className="flex items-center justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isMutating}
                      onClick={closePanel}
                    >
                      Cancel
                    </Button>
                    <Button size="sm" disabled={isMutating} onClick={() => void submitPanel()}>
                      {isMutating ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                      Create
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
                New Folder
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-80 p-3">
                <div className="space-y-3">
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-foreground">
                      {panelState?.title ?? 'New Folder'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {panelState?.description ?? `Create a new folder in ${getBaseName(selectedItem.path)}.`}
                    </p>
                  </div>
                  <Input
                    ref={panelInputRef}
                    value={panelName}
                    onChange={(event) => setPanelName(event.target.value)}
                    placeholder="Enter folder name"
                    onKeyDown={handlePanelInputKeyDown}
                  />
                  <div className="flex items-center justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isMutating}
                      onClick={closePanel}
                    >
                      Cancel
                    </Button>
                    <Button size="sm" disabled={isMutating} onClick={() => void submitPanel()}>
                      {isMutating ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                      Create
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
                    title: 'Open failed',
                    description: 'Could not open in default app.',
                    type: 'error',
                  });
                } finally {
                  closeMenu();
                }
              }}
            >
              <ExternalLink />
              Open in Default App
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleDuplicate} disabled={isMutating}>
              <Files />
              Duplicate
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={async () => {
                await copyToClipboard(selectedItem.path, 'Path copied');
                closeMenu();
              }}
            >
              <Copy />
              Copy Path
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={async () => {
                await copyToClipboard(relativePath || selectedItem.path, 'Relative path copied');
                closeMenu();
              }}
            >
              <Copy />
              Copy Relative Path
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
                Rename
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-80 p-3">
                <div className="space-y-3">
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-foreground">
                      {panelState?.title ?? 'Rename'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {panelState?.description ?? `Rename ${selectedItem.name}.`}
                    </p>
                  </div>
                  <Input
                    ref={panelInputRef}
                    value={panelName}
                    onChange={(event) => setPanelName(event.target.value)}
                    placeholder="Enter name"
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
                      Cancel
                    </Button>
                    <Button size="sm" disabled={isMutating} onClick={() => void submitPanel()}>
                      {isMutating ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                      Rename
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
                  Delete
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
                      {selectedItem?.isDir ? 'Delete Folder?' : 'Delete File?'}
                    </p>
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      {selectedItem?.isDir
                        ? `Delete "${selectedItem.name}" and everything inside it. This cannot be undone.`
                        : `Delete "${selectedItem?.name}". This cannot be undone.`}
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
                      Cancel
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
                      Delete
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
