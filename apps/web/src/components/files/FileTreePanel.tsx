"use client";

import React from "react";
import { Eye, EyeOff, Folder, LoaderCircle, RotateCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { FileTree } from "@/components/files/FileTree";
import { useFileTreeStore } from "@/hooks/use-file-tree-store";

interface FileTreePanelProps {
  projectName?: string | null;
}

export const FileTreePanel: React.FC<FileTreePanelProps> = ({ projectName }) => {
  const data = useFileTreeStore((s) => s.data);
  const rootPath = useFileTreeStore((s) => s.rootPath);
  const isLoading = useFileTreeStore((s) => s.isLoading);
  const refresh = useFileTreeStore((s) => s.refresh);
  const showHidden = useFileTreeStore((s) => s.showHidden);
  const setShowHidden = useFileTreeStore((s) => s.setShowHidden);

  if (!rootPath) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground/50">
        <Folder className="size-8 opacity-20 mb-2" />
        <span className="text-xs text-center">Select a workspace to view files</span>
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
              onClick={() => setShowHidden(!showHidden)}
              className={cn(
                "p-1 hover:bg-sidebar-accent rounded-sm transition-colors",
                showHidden ? "text-sidebar-foreground bg-sidebar-accent" : "text-muted-foreground",
              )}
              title={showHidden ? "Hide hidden files" : "Show hidden files"}
            >
              {showHidden ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
            </button>
            <button
              type="button"
              onClick={refresh}
              className="p-1 hover:bg-sidebar-accent rounded-sm transition-colors"
              title="Refresh files"
              disabled={isLoading}
            >
              {isLoading ? <LoaderCircle className="size-3.5 text-muted-foreground animate-spin" /> : <RotateCw className="size-3.5 text-muted-foreground" />}
            </button>
          </div>
        </div>
      )}
      <div className="flex-1 overflow-y-auto no-scrollbar min-h-0 pt-1.5">
        <FileTree
          data={data}
          rootPath={rootPath}
          isLoading={isLoading}
          onRefresh={refresh}
        />
      </div>
    </div>
  );
};
