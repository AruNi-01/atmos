"use client";

import React from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  Input,
  toastManager,
} from "@workspace/ui";
import {
  ArrowLeftToLine,
  ArrowRightToLine,
  Copy,
  Files,
  FolderTree,
  Pencil,
  X,
  XCircle,
} from "lucide-react";
import type { OpenFile } from "@/features/editor/store/use-editor-store";
import { getRelativePath } from "@/app-shell/center-stage-tabs";
import {
  isFileLikeCenterTabKind,
  type CenterTabContextMenuState,
  type CenterTabDescriptor,
} from "@/app-shell/center-stage-tab-model";

const menuItemClassName = "gap-1.5 cursor-pointer";
const menuIconClassName = "size-3.5 text-muted-foreground";

/** @deprecated Prefer CenterTabContextMenuState — kept for canvas file-only menus. */
export type FileTabContextMenuState = {
  x: number;
  y: number;
  filePath: string;
} | null;

export type { CenterTabContextMenuState, CenterTabDescriptor };

type CenterStageTabContextMenuProps = {
  tabContextMenu: CenterTabContextMenuState;
  setTabContextMenu: (value: CenterTabContextMenuState) => void;
  /**
   * Fallback visual order when the menu state has no snapshot
   * (e.g. file-only canvas menu). Prefer orderedTabs on the menu state.
   */
  orderedTabs?: CenterTabDescriptor[];
  basePath?: string;
  onCloseTab: (tab: CenterTabDescriptor) => void;
  onCloseTabs: (tabs: CenterTabDescriptor[]) => void;
  onRenameTerminalTab?: (tabId: string, title: string) => void;
};

export function CenterStageTabContextMenu({
  tabContextMenu,
  setTabContextMenu,
  orderedTabs: orderedTabsProp = [],
  basePath,
  onCloseTab,
  onCloseTabs,
  onRenameTerminalTab,
}: CenterStageTabContextMenuProps) {
  const t = useTranslations("appShell.fileTabContextMenu");
  const tabBarT = useTranslations("appShell.centerStageTabBar");
  const [mounted, setMounted] = React.useState(false);
  const [renameDraft, setRenameDraft] = React.useState("");
  const skipBlurCommitRef = React.useRef(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  const target = tabContextMenu?.tab ?? null;
  const isTerminal = target?.kind === "terminal";
  const isFileLike = target ? isFileLikeCenterTabKind(target.kind) : false;
  const fileTarget = target?.file;

  React.useEffect(() => {
    if (tabContextMenu?.tab.kind === "terminal") {
      setRenameDraft(tabContextMenu.tab.customTitle ?? "");
      skipBlurCommitRef.current = false;
    }
  }, [tabContextMenu]);

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

  const closeMenu = () => setTabContextMenu(null);

  const orderedTabs =
    tabContextMenu?.orderedTabs?.length
      ? tabContextMenu.orderedTabs
      : orderedTabsProp;

  const targetIndex = target
    ? orderedTabs.findIndex((tab) => tab.id === target.id)
    : -1;
  const leftTabs = targetIndex >= 0 ? orderedTabs.slice(0, targetIndex) : [];
  const rightTabs = targetIndex >= 0 ? orderedTabs.slice(targetIndex + 1) : [];
  const otherTabs =
    targetIndex >= 0
      ? orderedTabs.filter((tab) => tab.id !== target!.id)
      : [];

  const commitRename = () => {
    if (!target || !onRenameTerminalTab) return;
    skipBlurCommitRef.current = true;
    onRenameTerminalTab(target.value, renameDraft);
    closeMenu();
  };

  const cancelRename = () => {
    skipBlurCommitRef.current = true;
    setRenameDraft("");
    closeMenu();
  };

  const handleRenameBlur = () => {
    if (skipBlurCommitRef.current) {
      skipBlurCommitRef.current = false;
      return;
    }
    if (target && onRenameTerminalTab) {
      onRenameTerminalTab(target.value, renameDraft);
    }
  };

  const focusRenameInput = React.useCallback((el: HTMLInputElement | null) => {
    if (!el) return;
    requestAnimationFrame(() => el.focus());
  }, []);

  const relativePath =
    fileTarget && basePath
      ? getRelativePath(fileTarget.path, basePath)
      : fileTarget?.path ?? "";

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
          tabIndex={-1}
          className="fixed size-0 pointer-events-none"
          style={{
            left: tabContextMenu?.x ?? -9999,
            top: tabContextMenu?.y ?? -9999,
          }}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={4} className="z-[90] w-56">
        {target ? (
          <>
            {isTerminal && onRenameTerminalTab ? (
              <>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger className={menuItemClassName}>
                    <Pencil className={menuIconClassName} />
                    <span>{tabBarT("renameTab")}</span>
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="w-64 p-2">
                    <Input
                      ref={focusRenameInput}
                      value={renameDraft}
                      placeholder={tabBarT("renameTabPlaceholder")}
                      onChange={(event) => setRenameDraft(event.target.value)}
                      onKeyDown={(event) => {
                        event.stopPropagation();
                        if (event.key === "Enter") {
                          event.preventDefault();
                          commitRename();
                        } else if (event.key === "Escape") {
                          event.preventDefault();
                          cancelRename();
                        }
                      }}
                      onBlur={handleRenameBlur}
                      className="h-8 text-sm"
                    />
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuSeparator />
              </>
            ) : null}

            <DropdownMenuItem
              className={menuItemClassName}
              onClick={() => {
                onCloseTab(target);
                closeMenu();
              }}
            >
              <X className={menuIconClassName} />
              {t("close")}
            </DropdownMenuItem>
            <DropdownMenuItem
              className={menuItemClassName}
              onClick={() => {
                onCloseTabs(otherTabs);
                closeMenu();
              }}
              disabled={otherTabs.length === 0}
            >
              <Files className={menuIconClassName} />
              {t("closeOthers")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className={menuItemClassName}
              onClick={() => {
                onCloseTabs(leftTabs);
                closeMenu();
              }}
              disabled={leftTabs.length === 0}
            >
              <ArrowLeftToLine className={menuIconClassName} />
              {t("closeAllLeft")}
            </DropdownMenuItem>
            <DropdownMenuItem
              className={menuItemClassName}
              onClick={() => {
                onCloseTabs(rightTabs);
                closeMenu();
              }}
              disabled={rightTabs.length === 0}
            >
              <ArrowRightToLine className={menuIconClassName} />
              {t("closeAllRight")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className={menuItemClassName}
              onClick={() => {
                onCloseTabs(orderedTabs);
                closeMenu();
              }}
              disabled={orderedTabs.length === 0}
            >
              <XCircle className={menuIconClassName} />
              {t("closeAll")}
            </DropdownMenuItem>

            {isFileLike && fileTarget ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className={menuItemClassName}
                  onClick={async () => {
                    await copyToClipboard(fileTarget.path);
                    closeMenu();
                  }}
                >
                  <Copy className={menuIconClassName} />
                  {t("copyPath")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  className={menuItemClassName}
                  onClick={async () => {
                    await copyToClipboard(relativePath);
                    closeMenu();
                  }}
                >
                  <FolderTree className={menuIconClassName} />
                  {t("copyRelativePath")}
                </DropdownMenuItem>
              </>
            ) : null}
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  if (!mounted) return null;
  return createPortal(menu, document.body);
}

/**
 * File-only context menu for Canvas center widgets and other file-scoped callers.
 * Prefer CenterStageTabContextMenu for the main center stage tab bar.
 */
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
  void anchorPosition;

  const orderedTabs = React.useMemo<CenterTabDescriptor[]>(
    () =>
      openFiles.map((file) => ({
        id: file.path,
        value: file.path,
        kind: "file" as const,
        label: file.name,
        file,
      })),
    [openFiles],
  );

  const unifiedState: CenterTabContextMenuState = React.useMemo(() => {
    if (!tabContextMenu) return null;
    const file = openFiles.find((item) => item.path === tabContextMenu.filePath);
    if (!file) return null;
    return {
      x: tabContextMenu.x,
      y: tabContextMenu.y,
      tab: {
        id: file.path,
        value: file.path,
        kind: "file",
        label: file.name,
        file,
      },
      orderedTabs,
    };
  }, [openFiles, orderedTabs, tabContextMenu]);

  return (
    <CenterStageTabContextMenu
      tabContextMenu={unifiedState}
      setTabContextMenu={(next) => {
        if (!next) {
          setTabContextMenu(null);
          return;
        }
        setTabContextMenu({
          x: next.x,
          y: next.y,
          filePath: next.tab.file?.path ?? next.tab.value,
        });
      }}
      orderedTabs={orderedTabs}
      basePath={basePath}
      onCloseTab={(tab) => {
        if (tab.file) onCloseFile(tab.file);
      }}
      onCloseTabs={(tabs) => {
        closeFilesSafely(tabs.map((tab) => tab.file).filter((file): file is OpenFile => !!file));
      }}
    />
  );
}
