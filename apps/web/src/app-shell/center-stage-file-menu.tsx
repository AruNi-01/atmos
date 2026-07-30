"use client";

import React from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  toastManager,
} from "@workspace/ui";
import type { OpenFile } from "@/features/editor/store/use-editor-store";
import { getRelativePath } from "@/app-shell/center-stage-tabs";

export type FileTabContextMenuState = {
  x: number;
  y: number;
  filePath: string;
} | null;

export function CenterStageFileTabContextMenu({
  tabContextMenu,
  setTabContextMenu,
  openFiles,
  basePath,
  anchorPosition = "fixed",
  onCloseFile,
  closeFilesSafely,
}: {
  tabContextMenu: FileTabContextMenuState;
  setTabContextMenu: (value: FileTabContextMenuState) => void;
  openFiles: OpenFile[];
  basePath?: string;
  anchorPosition?: "fixed" | "absolute";
  onCloseFile: (file: OpenFile) => void;
  closeFilesSafely: (files: OpenFile[]) => void;
}) {
  const t = useTranslations("appShell.fileTabContextMenu");
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => {
    setMounted(true);
  }, []);

  const copyToClipboard = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      toastManager.add({
        title: t("copyFailedTitle"),
        description: t("clipboardUnavailable"),
        type: "error",
      });
    }
  };

  // Always use viewport-fixed coords + body portal (ignore absolute anchors).
  // Parent transforms in center stage make non-portaled fixed anchors drift.
  void anchorPosition;

  const menu = (
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
      <DropdownMenuContent align="start" sideOffset={4} className="z-[90] w-52">
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
                {t("close")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  closeFilesSafely(openFiles.filter((file) => file.path !== target.path));
                  setTabContextMenu(null);
                }}
                disabled={openFiles.length <= 1}
              >
                {t("closeOthers")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => {
                  closeFilesSafely(leftFiles);
                  setTabContextMenu(null);
                }}
                disabled={leftFiles.length === 0}
              >
                {t("closeAllLeft")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  closeFilesSafely(rightFiles);
                  setTabContextMenu(null);
                }}
                disabled={rightFiles.length === 0}
              >
                {t("closeAllRight")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => {
                  closeFilesSafely(openFiles);
                  setTabContextMenu(null);
                }}
                disabled={openFiles.length === 0}
              >
                {t("closeAll")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={async () => {
                  await copyToClipboard(target.path);
                  setTabContextMenu(null);
                }}
              >
                {t("copyPath")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={async () => {
                  await copyToClipboard(relativePath);
                  setTabContextMenu(null);
                }}
              >
                {t("copyRelativePath")}
              </DropdownMenuItem>
            </>
          );
        })()}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  if (!mounted) return null;
  return createPortal(menu, document.body);
}
