"use client";

import React, { useState } from "react";
import {
  Button,
  ChevronRight,
  Plus,
  Minus,
  Loader2,
  Popover,
  PopoverContent,
  PopoverTrigger,
  getFileIconProps,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@workspace/ui";
import { cn } from "@/lib/utils";
import { useEditorStore } from "@/hooks/use-editor-store";
import type { GitChangedFile } from "@/api/ws-api";
import { DiffFileTree } from "@/components/diff/DiffFileTree";

function FileIcon({ name, className }: { name: string; className?: string }) {
  const iconProps = getFileIconProps({ name, isDir: false, className });
  return <img {...iconProps} />;
}

function stopActionEvent(
  event:
    | React.MouseEvent<HTMLElement>
    | React.PointerEvent<HTMLElement>,
) {
  event.preventDefault();
  event.stopPropagation();
}

export interface ChangeSectionProps {
  kind: "staged" | "unstaged" | "untracked" | "compared";
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
  viewMode?: "list" | "tree";
}

export const ChangeSection = React.memo<ChangeSectionProps>(function ChangeSection({
  kind,
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
  viewMode = "list",
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [confirmingActionKey, setConfirmingActionKey] = useState<string | null>(null);
  const [runningActionKey, setRunningActionKey] = useState<string | null>(null);
  const activeFilePath = useEditorStore((s) =>
    s.getActiveFilePath(workspaceId || undefined),
  );
  const openFile = useEditorStore((s) => s.openFile);
  const pinFile = useEditorStore((s) => s.pinFile);

  if (files.length === 0) return null;

  const isDestructiveSection = kind === "unstaged" || kind === "untracked";

  const stageLabel = kind === "untracked" ? "Stage Files" : "Stage Changes";
  const hasActiveSectionAction =
    confirmingActionKey !== null || runningActionKey !== null;
  const runAction = async (
    actionKey: string,
    action?: () => void | Promise<void>,
  ) => {
    if (!action) return;
    try {
      setRunningActionKey(actionKey);
      await action();
    } catch (error) {
      throw error;
    } finally {
      setRunningActionKey((current) => (current === actionKey ? null : current));
      setConfirmingActionKey((current) => (current === actionKey ? null : current));
    }
  };

  const openDiffFile = (path: string, preview: boolean) => {
    void openFile(`diff://${path}`, workspaceId || undefined, { preview });
    if (!preview) {
      pinFile(`diff://${path}`, workspaceId || undefined);
    }
  };

  const renderConfirmableMinusAction = ({
    actionKey,
    onConfirm,
    title,
    description,
  }: {
    actionKey: string;
    onConfirm?: () => void | Promise<void>;
    title: string;
    description: string;
  }) => {
    if (!onConfirm) return null;

    const isOpen = confirmingActionKey === actionKey;
    const isRunning = runningActionKey === actionKey;

    return (
      <Popover
        open={isOpen}
        onOpenChange={(open) => {
          if (isRunning) return;
          setConfirmingActionKey(open ? actionKey : null);
        }}
      >
        <PopoverTrigger asChild>
          <button
            type="button"
            onPointerDown={stopActionEvent}
            onMouseDown={stopActionEvent}
            onDoubleClick={stopActionEvent}
            onClick={(e) => {
              stopActionEvent(e);
              setConfirmingActionKey((current) =>
                current === actionKey ? null : actionKey,
              );
            }}
            title={title}
            className="p-1 rounded-md cursor-pointer text-muted-foreground hover:text-foreground transition-colors"
          >
            <Minus className="size-3.5" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          className="w-72 border-border bg-popover p-3 shadow-lg"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="space-y-3">
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">{title}</p>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {description}
              </p>
            </div>
            <div className="flex items-center justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={isRunning}
                onPointerDown={stopActionEvent}
                onClick={(e) => {
                  stopActionEvent(e);
                  setConfirmingActionKey(null);
                }}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                disabled={isRunning}
                onPointerDown={stopActionEvent}
                onClick={(e) => {
                  stopActionEvent(e);
                  void runAction(actionKey, onConfirm);
                }}
              >
                {isRunning ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                Confirm
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    );
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="w-full">
      <div className="group/header relative mb-1 rounded-sm px-2 py-1 hover:bg-sidebar-accent/50">
        <CollapsibleTrigger className="flex min-w-0 flex-1 items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors">
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

        <div
          className={cn(
            "absolute top-1/2 right-2 z-10 flex -translate-y-1/2 items-center gap-1 rounded-sm bg-sidebar-accent/95 transition-opacity",
            hasActiveSectionAction
              ? "opacity-100 pointer-events-auto"
              : "pointer-events-none opacity-0 group-hover/header:pointer-events-auto group-hover/header:opacity-100",
          )}
        >
          {onStageAll && (
            <button
              type="button"
              onPointerDown={stopActionEvent}
              onMouseDown={stopActionEvent}
              onDoubleClick={stopActionEvent}
              onClick={(e) => {
                stopActionEvent(e);
                void runAction(`${kind}-bulk-stage`, onStageAll);
              }}
              title="Stage All"
              className="p-1 hover:bg-sidebar-accent rounded-sm cursor-pointer hover:text-foreground text-muted-foreground transition-colors"
            >
              <Plus className="size-3.5" />
            </button>
          )}
          {kind === "staged" && onUnstageAll && (
            <button
              type="button"
              onPointerDown={stopActionEvent}
              onMouseDown={stopActionEvent}
              onDoubleClick={stopActionEvent}
              onClick={(e) => {
                stopActionEvent(e);
                void runAction(`${kind}-bulk-unstage`, onUnstageAll);
              }}
              title="Unstage All"
              className="p-1 hover:bg-sidebar-accent rounded-sm cursor-pointer hover:text-foreground text-muted-foreground transition-colors"
            >
              <Minus className="size-3.5" />
            </button>
          )}
          {isDestructiveSection
            ? renderConfirmableMinusAction({
                actionKey: `${kind}-bulk-discard`,
                onConfirm: onDiscardAll,
                title: kind === "untracked" ? "Delete all untracked files?" : "Discard all unstaged changes?",
                description:
                  kind === "untracked"
                    ? "This will permanently delete every untracked file in this section."
                    : "This will discard every unstaged change in this section.",
              })
            : null}
        </div>
      </div>

      <CollapsibleContent>
        {viewMode === "tree" ? (
          <div className="mt-0.5 overflow-hidden pb-2">
            <DiffFileTree
              items={files.map((file) => ({
                path: file.path,
                gitStatus: file.status,
                additions: file.additions,
                deletions: file.deletions,
              }))}
              selectedPath={
                activeFilePath?.startsWith("diff://")
                  ? activeFilePath.slice("diff://".length)
                  : undefined
              }
              ariaLabel={`${title} tree`}
              className="max-h-[360px]"
              indentOffset={28}
              isFileActionActive={(path) =>
                confirmingActionKey?.includes(`:${path}:`) ||
                runningActionKey?.includes(`:${path}:`) ||
                false
              }
              isDirectoryActionActive={(items) =>
                items.some(
                  (item) =>
                    confirmingActionKey?.includes(item.path) ||
                    runningActionKey?.includes(item.path),
                )
              }
              renderFileActions={(file) => {
                const fileName = file.path.split("/").pop() || file.path;

                return (
                  <>
                    {onStage && (
                      <button
                        type="button"
                        onPointerDown={stopActionEvent}
                        onMouseDown={stopActionEvent}
                        onDoubleClick={stopActionEvent}
                        onClick={(e) => {
                          stopActionEvent(e);
                          void runAction(`${kind}:${file.path}:stage`, () =>
                            onStage([file.path]),
                          );
                        }}
                        title={stageLabel}
                        className="p-1 rounded-md cursor-pointer text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <Plus className="size-3.5" />
                      </button>
                    )}
                    {kind === "staged" && onUnstage && (
                      <button
                        type="button"
                        onPointerDown={stopActionEvent}
                        onMouseDown={stopActionEvent}
                        onDoubleClick={stopActionEvent}
                        onClick={(e) => {
                          stopActionEvent(e);
                          void runAction(`${kind}:${file.path}:unstage`, () =>
                            onUnstage([file.path]),
                          );
                        }}
                        title="Unstage Changes"
                        className="p-1 rounded-md cursor-pointer text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <Minus className="size-3.5" />
                      </button>
                    )}
                    {isDestructiveSection
                      ? renderConfirmableMinusAction({
                          actionKey: `${kind}:${file.path}:discard`,
                          onConfirm: () => onDiscard?.([file.path]),
                          title:
                            kind === "untracked"
                              ? `Delete "${fileName}"?`
                              : `Discard changes in "${fileName}"?`,
                          description:
                            kind === "untracked"
                              ? "This removes the untracked file from disk."
                              : "This restores the file to its last committed state.",
                        })
                      : null}
                  </>
                );
              }}
              renderDirectoryActions={(items) => {
                const paths = items.map((item) => item.path);
                const label = `${paths.length} files`;

                return (
                  <>
                    {onStage && (
                      <button
                        type="button"
                        onPointerDown={stopActionEvent}
                        onMouseDown={stopActionEvent}
                        onDoubleClick={stopActionEvent}
                        onClick={(e) => {
                          stopActionEvent(e);
                          void runAction(`${kind}:${paths.join("|")}:stage`, () =>
                            onStage(paths),
                          );
                        }}
                        title={`${stageLabel} in folder (${label})`}
                        className="p-1 rounded-md cursor-pointer text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <Plus className="size-3.5" />
                      </button>
                    )}
                    {kind === "staged" && onUnstage && (
                      <button
                        type="button"
                        onPointerDown={stopActionEvent}
                        onMouseDown={stopActionEvent}
                        onDoubleClick={stopActionEvent}
                        onClick={(e) => {
                          stopActionEvent(e);
                          void runAction(`${kind}:${paths.join("|")}:unstage`, () =>
                            onUnstage(paths),
                          );
                        }}
                        title={`Unstage changes in folder (${label})`}
                        className="p-1 rounded-md cursor-pointer text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <Minus className="size-3.5" />
                      </button>
                    )}
                    {isDestructiveSection
                      ? renderConfirmableMinusAction({
                          actionKey: `${kind}:${paths.join("|")}:discard`,
                          onConfirm: () => onDiscard?.(paths),
                          title:
                            kind === "untracked"
                              ? `Delete ${label}?`
                              : `Discard changes in ${label}?`,
                          description:
                            kind === "untracked"
                              ? "This removes every untracked file in this folder from disk."
                              : "This restores every changed file in this folder to its last committed state.",
                        })
                      : null}
                  </>
                );
              }}
              onSelectFile={(path) => openDiffFile(path, true)}
              onDoubleClickFile={(path) => openDiffFile(path, false)}
            />
          </div>
        ) : (
          <div className="flex flex-col gap-0.5 mt-0.5 overflow-hidden pb-2">
            {files.map((file) => {
            const fileName = file.path.split("/").pop() || file.path;
            const parts = file.path.split("/");
            parts.pop();
            const dirPath = parts.join("/");
            const hasActiveRowAction =
              confirmingActionKey?.includes(`:${file.path}:`) ||
              runningActionKey?.includes(`:${file.path}:`);

            return (
              <div
                key={file.path}
                onClick={() => openDiffFile(file.path, true)}
                onDoubleClick={() => openDiffFile(file.path, false)}
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
                      "flex items-center gap-2 text-[11px] font-mono tabular-nums min-w-[30px] justify-end",
                      hasActiveRowAction ? "invisible" : "group-hover:invisible",
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

                  <div
                    className={cn(
                      "absolute right-2 z-10 flex items-center gap-1 rounded-md bg-sidebar-accent/95 transition-opacity",
                      hasActiveRowAction
                        ? "opacity-100 pointer-events-auto"
                        : "opacity-0 pointer-events-none group-hover:pointer-events-auto group-hover:opacity-100",
                    )}
                  >
                    {onStage && (
                      <button
                        type="button"
                        onPointerDown={stopActionEvent}
                        onMouseDown={stopActionEvent}
                        onDoubleClick={stopActionEvent}
                        onClick={(e) => {
                          stopActionEvent(e);
                          void runAction(`${kind}:${file.path}:stage`, () =>
                            onStage([file.path]),
                          );
                        }}
                        title={stageLabel}
                        className="p-1 rounded-md cursor-pointer text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <Plus className="size-3.5" />
                      </button>
                    )}
                    {kind === "staged" && onUnstage && (
                      <button
                        type="button"
                        onPointerDown={stopActionEvent}
                        onMouseDown={stopActionEvent}
                        onDoubleClick={stopActionEvent}
                        onClick={(e) => {
                          stopActionEvent(e);
                          void runAction(`${kind}:${file.path}:unstage`, () =>
                            onUnstage([file.path]),
                          );
                        }}
                        title="Unstage Changes"
                        className="p-1 rounded-md cursor-pointer text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <Minus className="size-3.5" />
                      </button>
                    )}
                    {isDestructiveSection
                      ? renderConfirmableMinusAction({
                          actionKey: `${kind}:${file.path}:discard`,
                          onConfirm: () => onDiscard?.([file.path]),
                          title:
                            kind === "untracked"
                              ? `Delete "${fileName}"?`
                              : `Discard changes in "${fileName}"?`,
                          description:
                            kind === "untracked"
                              ? "This removes the untracked file from disk."
                              : "This restores the file to its last committed state.",
                        })
                      : null}
                  </div>
                </div>
              </div>
            );
            })}
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
});
