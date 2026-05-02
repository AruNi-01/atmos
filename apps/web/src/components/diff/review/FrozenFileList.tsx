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

function gitStatusClassName(status: string | null | undefined) {
  switch (status) {
    case "A":
    case "?":
      return "text-emerald-500";
    case "D":
      return "text-red-500";
    case "R":
      return "text-sky-400";
    case "M":
    default:
      return "text-yellow-500";
  }
}

function ChangeCountDecoration({
  additions,
  deletions,
}: {
  additions: number;
  deletions: number;
}) {
  if (additions <= 0 && deletions <= 0) return null;

  return (
    <span className="flex items-center gap-1 font-mono font-medium tabular-nums">
      {additions > 0 ? (
        <span className="text-emerald-500">+{additions}</span>
      ) : null}
      {deletions > 0 ? (
        <span className="text-red-500">-{deletions}</span>
      ) : null}
    </span>
  );
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
            additions: file.additions,
            deletions: file.deletions,
            annotation: annotations.join(" · "),
          };
        })}
        selectedPath={currentFilePath}
        ariaLabel="Review changed files tree"
        className="max-h-[320px]"
        renderFileInlineDecoration={(item) => {
          const file = fileByPath.get(item.path);
          if (!file || file.open_comment_count <= 0) return null;

          return (
            <span className="ml-2 flex items-center gap-0.5 text-[11px] text-muted-foreground">
              <MessageSquare className="size-3" />
              {file.open_comment_count}
            </span>
          );
        }}
        renderFileDecoration={(item) => {
          const file = fileByPath.get(item.path);
          if (!file) return null;
          const status = item.gitStatus === "?" ? "U" : item.gitStatus;
          const annotations = [
            file.changed_after_review ? (
              <span key="changed" className="text-amber-600">
                ●
              </span>
            ) : null,
            item.gitStatus !== "?" ? (
              <ChangeCountDecoration
                key="changes"
                additions={file.additions}
                deletions={file.deletions}
              />
            ) : null,
            status ? (
              <span
                key="status"
                className={cn(
                  "w-3 text-center font-mono text-[11px] font-bold",
                  gitStatusClassName(item.gitStatus),
                )}
              >
                {status}
              </span>
            ) : null,
          ].filter(Boolean);

          if (annotations.length === 0) return null;

          return (
            <div className="flex items-center gap-2 text-[11px]">
              {annotations}
            </div>
          );
        }}
        renderFileActions={(item) => {
          const file = fileByPath.get(item.path);
          if (!file) return null;

          return (
            <Checkbox
              checked={file.state.reviewed}
              disabled={!canEdit}
              onPointerDown={(event) => {
                event.stopPropagation();
              }}
              onClick={(event) => {
                event.stopPropagation();
              }}
              onCheckedChange={(value: boolean) =>
                onToggleReviewed(file, Boolean(value))
              }
              className="m-1"
            />
          );
        }}
        renderDirectoryActions={(items) => {
          const files = items
            .map((item) => fileByPath.get(item.path))
            .filter((file): file is ReviewFileDto => Boolean(file));
          if (files.length === 0) return null;

          const reviewedCount = files.filter((file) => file.state.reviewed).length;
          const checked =
            reviewedCount === files.length
              ? true
              : reviewedCount === 0
                ? false
                : "indeterminate";

          return (
            <Checkbox
              checked={checked}
              disabled={!canEdit}
              onPointerDown={(event) => {
                event.stopPropagation();
              }}
              onClick={(event) => {
                event.stopPropagation();
              }}
              onCheckedChange={(value: boolean) => {
                const nextChecked = Boolean(value);
                void Promise.all(
                  files.map((file) => onToggleReviewed(file, nextChecked)),
                );
              }}
              className="m-1"
            />
          );
        }}
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
        const status = file.snapshot.git_status;
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
              {status !== "?" ? (
                <ChangeCountDecoration
                  additions={file.additions}
                  deletions={file.deletions}
                />
              ) : null}
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
