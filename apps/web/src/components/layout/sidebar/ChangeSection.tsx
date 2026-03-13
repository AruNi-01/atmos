"use client";

import React, { useState } from "react";
import {
  ChevronRight,
  Plus,
  Minus,
  Undo2,
  getFileIconProps,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@workspace/ui";
import { cn } from "@/lib/utils";
import { useEditorStore } from "@/hooks/use-editor-store";
import type { GitChangedFile } from "@/api/ws-api";

function FileIcon({ name, className }: { name: string; className?: string }) {
  const iconProps = getFileIconProps({ name, isDir: false, className });
  return <img {...iconProps} />;
}

export interface ChangeSectionProps {
  title: string;
  files: GitChangedFile[];
  defaultOpen?: boolean;
  onStage?: (files: string[]) => void;
  onUnstage?: (files: string[]) => void;
  onDiscard?: (files: string[]) => void;
  onStageAll?: () => void;
  onUnstageAll?: () => void;
  onDiscardAll?: () => void;
  workspaceId: string | null;
}

export const ChangeSection = React.memo<ChangeSectionProps>(function ChangeSection({
  title,
  files,
  defaultOpen = true,
  onStage,
  onUnstage,
  onDiscard,
  onStageAll,
  onUnstageAll,
  onDiscardAll,
  workspaceId,
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const { openFile, getActiveFilePath, pinFile } = useEditorStore();
  const activeFilePath = getActiveFilePath(workspaceId || undefined);

  if (files.length === 0) return null;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="w-full">
      <div className="flex items-center justify-between px-2 py-1 hover:bg-sidebar-accent/50 group/header rounded-sm mb-1">
        <CollapsibleTrigger className="flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors w-full">
          <ChevronRight
            className={cn(
              "size-3.5 transition-transform duration-200",
              isOpen && "rotate-90",
            )}
          />
          <span>{title}</span>
          <span className="text-[10px] ml-1 px-1.5 rounded-full bg-sidebar-accent text-muted-foreground tabular-nums">
            {files.length}
          </span>
        </CollapsibleTrigger>

        <div className="flex items-center gap-1 opacity-0 group-hover/header:opacity-100 transition-opacity">
          {onStageAll && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onStageAll();
              }}
              title="Stage All"
              className="p-1 hover:bg-sidebar-accent rounded-sm cursor-pointer hover:text-foreground text-muted-foreground transition-colors"
            >
              <Plus className="size-3.5" />
            </button>
          )}
          {onUnstageAll && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onUnstageAll();
              }}
              title="Unstage All"
              className="p-1 hover:bg-sidebar-accent rounded-sm cursor-pointer hover:text-foreground text-muted-foreground transition-colors"
            >
              <Minus className="size-3.5" />
            </button>
          )}
          {onDiscardAll && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDiscardAll();
              }}
              title="Discard All"
              className="p-1 hover:bg-sidebar-accent rounded-sm cursor-pointer hover:text-foreground text-muted-foreground transition-colors"
            >
              <Undo2 className="size-3.5" />
            </button>
          )}
        </div>
      </div>

      <CollapsibleContent>
        <div className="flex flex-col gap-0.5 mt-0.5 overflow-hidden pb-2">
          {files.map((file) => {
            const fileName = file.path.split("/").pop() || file.path;
            const parts = file.path.split("/");
            parts.pop();
            const dirPath = parts.join("/");

            return (
              <div
                key={file.path}
                onClick={() =>
                  openFile(`diff://${file.path}`, workspaceId || undefined, {
                    preview: true,
                  })
                }
                onDoubleClick={() =>
                  pinFile(`diff://${file.path}`, workspaceId || undefined)
                }
                className={cn(
                  "group flex items-center px-2 py-1.5 cursor-pointer transition-colors ease-out duration-200 w-full relative rounded-sm gap-2",
                  activeFilePath === `diff://${file.path}`
                    ? "bg-sidebar-accent text-sidebar-foreground"
                    : "hover:bg-sidebar-accent/50",
                )}
              >
                <FileIcon name={fileName} className="size-4 shrink-0" />

                <span className="text-[13px] text-muted-foreground group-hover:text-sidebar-foreground font-medium whitespace-nowrap shrink-0">
                  {fileName}
                </span>

                <span
                  className="text-[11px] text-muted-foreground/40 whitespace-nowrap truncate min-w-0 flex-1 text-left"
                  dir="rtl"
                >
                  {dirPath ? `${dirPath}/` : ""}
                </span>

                <div className="flex items-center h-4 shrink min-w-0 overflow-hidden">
                  <div
                    className={cn(
                      "flex items-center gap-2 text-[11px] font-mono tabular-nums group-hover:hidden min-w-[30px] justify-end",
                    )}
                  >
                    {file.status !== "?" && (
                      <div className="flex items-center gap-1 font-medium">
                        {file.additions > 0 && (
                          <span className="text-emerald-500">
                            +{file.additions}
                          </span>
                        )}
                        {file.deletions > 0 && (
                          <span className="text-red-500">
                            -{file.deletions}
                          </span>
                        )}
                      </div>
                    )}
                    <span
                      className={cn(
                        "w-3 text-center font-bold",
                        file.status === "M"
                          ? "text-yellow-500"
                          : file.status === "A" || file.status === "?"
                            ? "text-emerald-500"
                            : file.status === "D"
                              ? "text-red-500"
                              : "text-foreground",
                      )}
                    >
                      {file.status === "?" ? "U" : file.status}
                    </span>
                  </div>

                  <div className="hidden group-hover:flex items-center gap-1">
                    {onStage && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onStage([file.path]);
                        }}
                        title="Stage Changes"
                        className="p-1 hover:bg-background rounded-md cursor-pointer text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <Plus className="size-3.5" />
                      </button>
                    )}
                    {onUnstage && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onUnstage([file.path]);
                        }}
                        title="Unstage Changes"
                        className="p-1 hover:bg-background rounded-md cursor-pointer text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <Minus className="size-3.5" />
                      </button>
                    )}
                    {onDiscard && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDiscard([file.path]);
                        }}
                        title="Discard Changes"
                        className="p-1 hover:bg-background rounded-md cursor-pointer text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <Undo2 className="size-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
});
