"use client";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  toastManager,
} from "@workspace/ui";
import type { OpenFile } from "@/hooks/use-editor-store";
import { getRelativePath } from "@/components/layout/center-stage-tabs";

export type FileTabContextMenuState = {
  x: number;
  y: number;
  filePath: string;
} | null;

async function copyToClipboard(value: string) {
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    toastManager.add({
      title: "Copy failed",
      description: "Clipboard is not available.",
      type: "error",
    });
  }
}

export function CenterStageFileTabContextMenu({
  tabContextMenu,
  setTabContextMenu,
  openFiles,
  basePath,
  onCloseFile,
  closeFilesSafely,
}: {
  tabContextMenu: FileTabContextMenuState;
  setTabContextMenu: (value: FileTabContextMenuState) => void;
  openFiles: OpenFile[];
  basePath?: string;
  onCloseFile: (file: OpenFile) => void;
  closeFilesSafely: (files: OpenFile[]) => void;
}) {
  return (
    <DropdownMenu
      open={!!tabContextMenu}
      onOpenChange={(open) => {
        if (!open) setTabContextMenu(null);
      }}
    >
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-hidden
          className="fixed size-0 pointer-events-none"
          style={{
            left: tabContextMenu?.x ?? -9999,
            top: tabContextMenu?.y ?? -9999,
          }}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={4} className="w-52">
        {(() => {
          const target = openFiles.find((file) => file.path === tabContextMenu?.filePath);
          if (!target) return null;
          const targetIndex = openFiles.findIndex((file) => file.path === target.path);
          const leftFiles = openFiles.slice(0, targetIndex);
          const rightFiles = openFiles.slice(targetIndex + 1);
          const relativePath = getRelativePath(target.path, basePath);

          return (
            <>
              <DropdownMenuItem
                onClick={() => {
                  onCloseFile(target);
                  setTabContextMenu(null);
                }}
              >
                Close
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  closeFilesSafely(openFiles.filter((file) => file.path !== target.path));
                  setTabContextMenu(null);
                }}
                disabled={openFiles.length <= 1}
              >
                Close Others
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => {
                  closeFilesSafely(leftFiles);
                  setTabContextMenu(null);
                }}
                disabled={leftFiles.length === 0}
              >
                Close All Left
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  closeFilesSafely(rightFiles);
                  setTabContextMenu(null);
                }}
                disabled={rightFiles.length === 0}
              >
                Close All Right
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => {
                  closeFilesSafely(openFiles);
                  setTabContextMenu(null);
                }}
                disabled={openFiles.length === 0}
              >
                Close All
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={async () => {
                  await copyToClipboard(target.path);
                  setTabContextMenu(null);
                }}
              >
                Copy Path
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={async () => {
                  await copyToClipboard(relativePath);
                  setTabContextMenu(null);
                }}
              >
                Copy Relative Path
              </DropdownMenuItem>
            </>
          );
        })()}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
