"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Eye, EyeOff, Folder, LoaderCircle, RotateCcw } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { FileTree } from "@/features/files/components/FileTree";
import { useFileTreeStore } from "@/features/files/store/use-file-tree-store";
import {
  useFileTreeQuery,
  invalidateFileTree,
} from "@/features/files/hooks/use-file-tree-query";
import type { FileTreeNode } from "@/api/ws-api";

interface FileTreePanelProps {
  projectName?: string | null;
  data?: FileTreeNode[];
  rootPath?: string | null;
  isLoading?: boolean;
  showHidden?: boolean;
  contextId?: string | null;
  activeFilePath?: string | null;
  currentProjectPath?: string | null;
  revealEnabled?: boolean;
  contextMenuAnchor?: "fixed" | "local";
  onRefresh?: () => Promise<void> | void;
  onShowHiddenChange?: (show: boolean) => void;
  onOpenFile?: (
    path: string,
    options: { preview: boolean },
  ) => Promise<void> | void;
}

export const FileTreePanel: React.FC<FileTreePanelProps> = ({
  projectName,
  data,
  rootPath,
  isLoading,
  showHidden,
  contextId,
  activeFilePath,
  currentProjectPath,
  revealEnabled,
  contextMenuAnchor,
  onRefresh,
  onShowHiddenChange,
  onOpenFile,
}) => {
  const t = useTranslations("files.components");
  const storeRootPath = useFileTreeStore((s) => s.rootPath);
  const storeShowHidden = useFileTreeStore((s) => s.showHidden);
  const setStoreShowHidden = useFileTreeStore((s) => s.setShowHidden);

  const effectiveRootPath = rootPath ?? storeRootPath;
  const effectiveShowHidden = showHidden ?? storeShowHidden;

  const fileTreeQuery = useFileTreeQuery(effectiveRootPath, effectiveShowHidden);

  const effectiveData = data ?? fileTreeQuery.data?.tree ?? [];
  const effectiveIsLoading =
    isLoading ?? (fileTreeQuery.isLoading || fileTreeQuery.isFetching);
  const effectiveRefresh =
    onRefresh ??
    (() =>
      effectiveRootPath
        ? invalidateFileTree(effectiveRootPath, effectiveShowHidden)
        : Promise.resolve());
  const handleShowHiddenChange = onShowHiddenChange ?? setStoreShowHidden;

  if (!effectiveRootPath) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground/50">
        <Folder className="size-8 opacity-20 mb-2" />
        <span className="text-xs text-center">
          {t("fileTreePanel.empty.selectWorkspace")}
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {projectName && (
        <div className="flex items-center justify-between px-3 py-1.5 border-b border-sidebar-border shrink-0">
          <span className="text-[12px] font-medium text-muted-foreground truncate">
            {projectName}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => handleShowHiddenChange(!effectiveShowHidden)}
              className={cn(
                "p-1 hover:bg-sidebar-accent rounded-sm transition-colors",
                effectiveShowHidden
                  ? "text-sidebar-foreground bg-sidebar-accent"
                  : "text-muted-foreground",
              )}
              title={
                effectiveShowHidden
                  ? t("fileTreePanel.actions.hideHiddenFiles")
                  : t("fileTreePanel.actions.showHiddenFiles")
              }
            >
              {effectiveShowHidden ? (
                <Eye className="size-3.5" />
              ) : (
                <EyeOff className="size-3.5" />
              )}
            </button>
            <button
              type="button"
              onClick={effectiveRefresh}
              className="p-1 hover:bg-sidebar-accent rounded-sm transition-colors"
              title={t("fileTreePanel.actions.refreshFiles")}
              disabled={effectiveIsLoading}
            >
              {effectiveIsLoading ? (
                <LoaderCircle className="size-3.5 text-muted-foreground animate-spin" />
              ) : (
                <RotateCcw className="size-3.5 text-muted-foreground" />
              )}
            </button>
          </div>
        </div>
      )}
      <div className="flex-1 overflow-y-auto no-scrollbar min-h-0 pt-1.5">
        <FileTree
          key={effectiveRootPath}
          data={effectiveData}
          rootPath={effectiveRootPath}
          isLoading={effectiveIsLoading}
          onRefresh={effectiveRefresh}
          contextId={contextId}
          activeFilePath={activeFilePath}
          currentProjectPath={currentProjectPath}
          revealEnabled={revealEnabled}
          contextMenuAnchor={contextMenuAnchor}
          onOpenFile={onOpenFile}
        />
      </div>
    </div>
  );
};
