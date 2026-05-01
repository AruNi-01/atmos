"use client";

import React, { useRef } from "react";
import { Checkbox, getFileIconProps } from "@workspace/ui";
import { MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ReviewFileDto, ReviewSessionDto } from "@/api/ws-api";
import { DiffFileTree } from "@/components/diff/DiffFileTree";

interface FrozenFileListProps {
  revision: ReviewSessionDto["revisions"][number] | null;
  currentFilePath: string;
  canEdit: boolean;
  onSelectFile: (snapshotGuid: string, filePath: string, label: string) => void;
  onDoubleClickFile?: (snapshotGuid: string, filePath: string) => void;
  onToggleReviewed: (file: ReviewFileDto, checked: boolean) => void | Promise<void>;
  revisionLabel: string;
  viewMode?: "list" | "tree";
}

function FileIcon({ name, className }: { name: string; className?: string }) {
  const iconProps = getFileIconProps({ name, isDir: false, className });
  return <img {...iconProps} />;
}

export const FrozenFileList: React.FC<FrozenFileListProps> = ({
  revision,
  currentFilePath,
  canEdit,
  onSelectFile,
  onDoubleClickFile,
  onToggleReviewed,
  revisionLabel,
  viewMode = "list",
}) => {
  const clickTimers = useRef<Record<string, number>>({});

  if (!revision || revision.files.length === 0) {
    return (
      <p className="text-xs text-muted-foreground px-1">
        No files in this revision.
      </p>
    );
  }

  if (viewMode === "tree") {
    const fileByPath = new Map(
      revision.files.map((file) => [file.snapshot.file_path, file]),
    );

    return (
      <DiffFileTree
        items={revision.files.map((file) => {
          const annotations = [
            file.state.reviewed ? "reviewed" : null,
            file.open_comment_count > 0 ? `${file.open_comment_count}` : null,
            file.changed_after_review ? "changed" : null,
          ].filter(Boolean);

          return {
            path: file.snapshot.file_path,
            gitStatus: file.snapshot.git_status,
            annotation: annotations.join(" · "),
          };
        })}
        selectedPath={currentFilePath}
        ariaLabel="Review changed files tree"
        className="h-[320px]"
        onSelectFile={(path) => {
          const file = fileByPath.get(path);
          if (!file) return;
          onSelectFile(file.snapshot.guid, path, revisionLabel);
        }}
        onDoubleClickFile={(path) => {
          const file = fileByPath.get(path);
          if (!file) return;
          onDoubleClickFile?.(file.snapshot.guid, path);
        }}
      />
    );
  }

  return (
    <div className="space-y-1">
      {revision.files.map((file) => {
        const path = file.snapshot.file_path;
        const fileName = path.split("/").pop() || path;
        const isCurrent = path === currentFilePath;
        return (
          <div
            key={file.snapshot.guid}
            className={cn(
              "group flex items-center gap-2 rounded-md px-2 py-1.5 text-xs",
              "hover:bg-sidebar-accent transition-colors",
              isCurrent && "bg-sidebar-accent",
            )}
          >
              <button
                type="button"
                onClick={() => {
                  onSelectFile(file.snapshot.guid, path, revisionLabel);
                  if (onDoubleClickFile) {
                    const now = Date.now();
                    const last = clickTimers.current[path] ?? 0;
                    clickTimers.current[path] = now;
                    if (now - last < 350) {
                      delete clickTimers.current[path];
                      onDoubleClickFile(file.snapshot.guid, path);
                    }
                  }
                }}
              className="flex flex-1 items-center gap-2 min-w-0 text-left cursor-pointer"
              title={path}
            >
              <FileIcon name={fileName} className="size-4 shrink-0" />
              <span className="truncate text-foreground">{path}</span>
              {file.open_comment_count > 0 && (
                <span className="flex items-center gap-0.5 text-muted-foreground shrink-0">
                  <MessageSquare className="size-3" />
                  {file.open_comment_count}
                </span>
              )}
              {file.changed_after_review && (
                <span className="text-amber-600 shrink-0">●</span>
              )}
            </button>
            <Checkbox
              checked={file.state.reviewed}
              disabled={!canEdit}
              onCheckedChange={(value: boolean) =>
                onToggleReviewed(file, Boolean(value))
              }
              className="shrink-0"
            />
          </div>
        );
      })}
    </div>
  );
};
