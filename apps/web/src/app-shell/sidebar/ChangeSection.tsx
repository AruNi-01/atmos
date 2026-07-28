"use client";

import React, { useState } from "react";
import { useTranslations } from "next-intl";
import {
  Button,
  ChevronRight,
  Plus,
  Minus,
  Loader2,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@workspace/ui";
import { cn } from "@/shared/lib/utils";
import { useEditorStore } from "@/features/editor/store/use-editor-store";
import type { GitChangedFile } from "@/api/ws-api";
import { buildDiffGroupPath, type DiffChangeGroupKind } from "@/features/diff/lib/diff-editor-paths";
import { DiffFileTree } from "@/features/diff/components/DiffFileTree";
import { DiffFilePathLabel } from "@/features/diff/components/DiffFilePathLabel";
import { sortByDiffTreePath } from "@/features/diff/lib/diff-file-order";
import { isLikelyBinaryPath } from "@/features/diff/lib/diff-content-kind";
import { useOverflowAwareDecorationVisibility } from "@/shared/hooks/use-overflow-aware-decoration-visibility";
import { setAgentContextDragData } from "@/shared/lib/agent-context-drag";

function stopActionEvent(
  event:
    | React.MouseEvent<HTMLElement>
    | React.PointerEvent<HTMLElement>,
) {
  event.preventDefault();
  event.stopPropagation();
}

export interface ChangeSectionProps {
  kind: DiffChangeGroupKind;
  title: string;
  files: GitChangedFile[];
  defaultOpen?: boolean;
  readOnly?: boolean;
  onStage?: (files: string[]) => void;
  onUnstage?: (files: string[]) => void;
  onDiscard?: (files: string[]) => void;
  onStageAll?: () => void;
  onUnstageAll?: () => void;
  onDiscardAll?: () => void;
  workspaceId: string | null;
  viewMode?: "list" | "tree";
  selectedFilePath?: string | null;
  hideHeader?: boolean;
  onOpenDiffFile?: (args: {
    kind: ChangeSectionProps["kind"];
    groupPath: string;
    filePath: string;
    preview: boolean;
  }) => void;
}

type ConfirmableMinusActionArgs = {
  actionKey: string;
  onConfirm?: () => void | Promise<void>;
  title: string;
  description: string;
};

function useShouldHideChangeCounts(measurementKey: string) {
  const {
    containerRef: labelRef,
    textRef: fileNameRef,
    decorationRef: countsRef,
    shouldHideDecoration: shouldHideCounts,
  } = useOverflowAwareDecorationVisibility({
    measurementKey,
    measureWithinContainer: true,
  });
  return { labelRef, fileNameRef, countsRef, shouldHideCounts };
}

interface ChangeFileRowProps {
  kind: ChangeSectionProps["kind"];
  file: GitChangedFile;
  isSelected: boolean;
  stageLabel: string;
  isDestructiveSection: boolean;
  confirmingActionKey: string | null;
  runningActionKey: string | null;
  onStage?: (files: string[]) => void;
  onUnstage?: (files: string[]) => void;
  onDiscard?: (files: string[]) => void;
  openDiffFile: (filePath: string, preview: boolean) => void;
  runAction: (
    actionKey: string,
    action?: () => void | Promise<void>,
  ) => Promise<void>;
  renderConfirmableMinusAction: (
    args: ConfirmableMinusActionArgs,
  ) => React.ReactNode;
  readOnly?: boolean;
}

function ChangeFileRow({
  kind,
  file,
  isSelected,
  stageLabel,
  isDestructiveSection,
  confirmingActionKey,
  runningActionKey,
  onStage,
  onUnstage,
  onDiscard,
  openDiffFile,
  runAction,
  renderConfirmableMinusAction,
  readOnly = false,
}: ChangeFileRowProps) {
  const t = useTranslations("AppShell.chrome");
  const fileName = file.path.split("/").pop() || file.path;
  const { labelRef, fileNameRef, countsRef, shouldHideCounts } =
    useShouldHideChangeCounts(file.path);
  const hasActiveRowAction =
    confirmingActionKey?.includes(`:${file.path}:`) ||
    runningActionKey?.includes(`:${file.path}:`);
  const hasRowActions =
    !readOnly &&
    Boolean(onStage || (kind === "staged" && onUnstage) || isDestructiveSection);

  return (
    <div
      draggable
      onDragStart={(event) => {
        setAgentContextDragData(event.dataTransfer, {
          kind: "file",
          path: file.path,
        });
      }}
      onClick={readOnly ? undefined : () => openDiffFile(file.path, true)}
      onDoubleClick={readOnly ? undefined : () => openDiffFile(file.path, false)}
      className={cn(
        "group flex items-center px-2 py-1.5 transition-colors ease-out duration-200 w-full relative rounded-sm gap-2",
        readOnly ? "cursor-default" : "cursor-pointer",
        isSelected
          ? "bg-sidebar-accent text-sidebar-foreground"
          : !readOnly && "hover:bg-sidebar-accent/50",
      )}
    >
      <DiffFilePathLabel
        path={file.path}
        labelRef={labelRef}
        fileNameRef={fileNameRef}
        className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden"
        fileNameClassName={cn(
          "min-w-0 truncate text-[13px] text-muted-foreground font-medium",
          !readOnly && "group-hover:text-sidebar-foreground",
        )}
        dirPathClassName="text-[11px] text-muted-foreground/40 whitespace-nowrap truncate min-w-0 flex-1 text-left"
      />

      <div className="flex items-center h-4 shrink-0 overflow-hidden">
        <div
          className={cn(
            "flex items-center gap-2 text-[11px] font-mono tabular-nums justify-end",
            hasRowActions &&
              (hasActiveRowAction ? "invisible" : "group-hover:invisible"),
          )}
        >
          {file.status !== "?" && (
            <div
              ref={countsRef}
              className={cn(
                "flex items-center gap-1 font-medium",
                shouldHideCounts && "hidden",
              )}
            >
              {file.is_binary || isLikelyBinaryPath(file.path) ? (
                <span className="text-muted-foreground font-sans text-[10px] font-medium uppercase tracking-wide">
                  {t("changeSection.binaryBadge")}
                </span>
              ) : (
                <>
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
                </>
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

        {hasRowActions ? (
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
                title={t("changeSection.unstageChanges")}
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
                      ? t("changeSection.deleteFileTitle", { fileName })
                      : t("changeSection.discardFileTitle", { fileName }),
                  description:
                    kind === "untracked"
                      ? t("changeSection.deleteFileDescription")
                      : t("changeSection.discardFileDescription"),
                })
              : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export const ChangeSection = React.memo<ChangeSectionProps>(function ChangeSection({
  kind,
  title,
  files,
  defaultOpen = true,
  readOnly = false,
  onStage,
  onUnstage,
  onDiscard,
  onStageAll,
  onUnstageAll,
  onDiscardAll,
  workspaceId,
  viewMode = "list",
  selectedFilePath,
  hideHeader = false,
  onOpenDiffFile,
}) {
  const t = useTranslations("AppShell.chrome");
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [confirmingActionKey, setConfirmingActionKey] = useState<string | null>(null);
  const [runningActionKey, setRunningActionKey] = useState<string | null>(null);
  const groupPath = buildDiffGroupPath(kind as DiffChangeGroupKind);
  const selectedDiffFilePath = useEditorStore((s) => {
    if (selectedFilePath !== undefined) return selectedFilePath ?? undefined;
    if (readOnly) return undefined;
    if (!workspaceId) return undefined;
    const active = s.workspaceStates[workspaceId]?.activeFilePath;
    if (active !== groupPath) return undefined;
    return s.diffGroupActiveFiles[workspaceId]?.[groupPath];
  });
  const openFile = useEditorStore((s) => s.openFile);
  const pinFile = useEditorStore((s) => s.pinFile);
  const orderedFiles = sortByDiffTreePath(files);

  if (orderedFiles.length === 0) return null;

  const isDestructiveSection = kind === "unstaged" || kind === "untracked";

  const stageLabel =
    kind === "untracked"
      ? t("changeSection.stageFiles")
      : t("changeSection.stageChanges");
  const hasActiveSectionAction =
    confirmingActionKey !== null || runningActionKey !== null;
  const hasSectionActions =
    !readOnly &&
    Boolean(
      onStageAll ||
        (kind === "staged" && onUnstageAll) ||
        (isDestructiveSection && onDiscardAll),
    );
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

  const openDiffFile = (filePath: string, preview: boolean) => {
    if (onOpenDiffFile) {
      onOpenDiffFile({ kind, groupPath, filePath, preview });
      return;
    }
    void openFile(groupPath, workspaceId || undefined, { preview, diffFilePath: filePath });
    if (!preview) {
      pinFile(groupPath, workspaceId || undefined);
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
                {t("common.cancel")}
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
                {t("common.confirm")}
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    );
  };

  const content = (
    <>
        {viewMode === "tree" ? (
          <div className={cn("overflow-hidden", hideHeader ? "pb-0" : "mt-0.5 pb-2")}>
            <DiffFileTree
              items={orderedFiles.map((file) => ({
                path: file.path,
                gitStatus: file.status,
                additions: file.additions,
                deletions: file.deletions,
                isBinary:
                  Boolean(file.is_binary) || isLikelyBinaryPath(file.path),
              }))}
              selectedPath={selectedDiffFilePath}
              ariaLabel={t("changeSection.treeAriaLabel", { title })}
              className=""
              indentOffset={hideHeader ? 4 : 28}
              isFileActionActive={readOnly ? undefined : (path) =>
                confirmingActionKey === `${kind}:file:${path}:stage` ||
                confirmingActionKey === `${kind}:file:${path}:unstage` ||
                confirmingActionKey === `${kind}:file:${path}:discard` ||
                runningActionKey === `${kind}:file:${path}:stage` ||
                runningActionKey === `${kind}:file:${path}:unstage` ||
                runningActionKey === `${kind}:file:${path}:discard`
              }
              isDirectoryActionActive={readOnly ? undefined : (items) => {
                const paths = items.map((item) => item.path);
                const key = paths.join("|");
                return (
                  confirmingActionKey === `${kind}:dir:${key}:stage` ||
                  confirmingActionKey === `${kind}:dir:${key}:unstage` ||
                  confirmingActionKey === `${kind}:dir:${key}:discard` ||
                  runningActionKey === `${kind}:dir:${key}:stage` ||
                  runningActionKey === `${kind}:dir:${key}:unstage` ||
                  runningActionKey === `${kind}:dir:${key}:discard`
                );
              }}
              renderFileActions={readOnly ? undefined : (file) => {
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
                          void runAction(`${kind}:file:${file.path}:stage`, () =>
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
                          void runAction(`${kind}:file:${file.path}:unstage`, () =>
                            onUnstage([file.path]),
                          );
                        }}
                        title={t("changeSection.unstageChanges")}
                        className="p-1 rounded-md cursor-pointer text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <Minus className="size-3.5" />
                      </button>
                    )}
                    {isDestructiveSection
                      ? renderConfirmableMinusAction({
                          actionKey: `${kind}:file:${file.path}:discard`,
                          onConfirm: () => onDiscard?.([file.path]),
                          title:
                            kind === "untracked"
                              ? t("changeSection.deleteFileTitle", { fileName })
                              : t("changeSection.discardFileTitle", { fileName }),
                          description:
                            kind === "untracked"
                              ? t("changeSection.deleteFileDescription")
                              : t("changeSection.discardFileDescription"),
                        })
                      : null}
                  </>
                );
              }}
              renderDirectoryActions={readOnly ? undefined : (items) => {
                const paths = items.map((item) => item.path);
                const label = t("changeSection.fileCountLabel", { count: paths.length });
                const key = paths.join("|");

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
                          void runAction(`${kind}:dir:${key}:stage`, () =>
                            onStage(paths),
                          );
                        }}
                        title={t("changeSection.stageInFolder", { stageLabel, label })}
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
                          void runAction(`${kind}:dir:${key}:unstage`, () =>
                            onUnstage(paths),
                          );
                        }}
                        title={t("changeSection.unstageInFolder", { label })}
                        className="p-1 rounded-md cursor-pointer text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <Minus className="size-3.5" />
                      </button>
                    )}
                    {isDestructiveSection
                      ? renderConfirmableMinusAction({
                          actionKey: `${kind}:dir:${key}:discard`,
                          onConfirm: () => onDiscard?.(paths),
                          title:
                            kind === "untracked"
                              ? t("changeSection.deleteFolderTitle", { label })
                              : t("changeSection.discardFolderTitle", { label }),
                          description:
                            kind === "untracked"
                              ? t("changeSection.deleteFolderDescription")
                              : t("changeSection.discardFolderDescription"),
                        })
                      : null}
                  </>
                );
              }}
              onSelectFile={readOnly ? () => {} : (path) => openDiffFile(path, true)}
              onDoubleClickFile={readOnly ? undefined : (path) => openDiffFile(path, false)}
            />
          </div>
        ) : (
          <div
            className={cn(
              "flex flex-col gap-0.5 overflow-hidden",
              hideHeader ? "pb-0" : "mt-0.5 pb-2",
            )}
          >
            {orderedFiles.map((file) => (
              <ChangeFileRow
                key={file.path}
                kind={kind}
                file={file}
                isSelected={selectedDiffFilePath === file.path}
                stageLabel={stageLabel}
                isDestructiveSection={isDestructiveSection}
                confirmingActionKey={confirmingActionKey}
                runningActionKey={runningActionKey}
                onStage={onStage}
                onUnstage={onUnstage}
                onDiscard={onDiscard}
                openDiffFile={openDiffFile}
                runAction={runAction}
                renderConfirmableMinusAction={renderConfirmableMinusAction}
                readOnly={readOnly}
              />
            ))}
          </div>
        )}
    </>
  );

  const renderSectionActions = (variant: "header" | "headerless") => {
    if (!hasSectionActions) return null;

    return (
      <div
        className={cn(
          "absolute z-10 flex items-center gap-1 rounded-sm bg-sidebar-accent/95 transition-opacity",
          variant === "header"
            ? "top-1/2 right-2 -translate-y-1/2"
            : "top-1 right-2",
          hasActiveSectionAction
            ? "opacity-100 pointer-events-auto"
            : variant === "header"
              ? "pointer-events-none opacity-0 group-hover/header:pointer-events-auto group-hover/header:opacity-100"
              : "pointer-events-none opacity-0 group-hover/headerless:pointer-events-auto group-hover/headerless:opacity-100",
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
            title={t("changeSection.stageAll")}
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
            title={t("changeSection.unstageAll")}
            className="p-1 hover:bg-sidebar-accent rounded-sm cursor-pointer hover:text-foreground text-muted-foreground transition-colors"
          >
            <Minus className="size-3.5" />
          </button>
        )}
        {isDestructiveSection
          ? renderConfirmableMinusAction({
              actionKey: `${kind}-bulk-discard`,
              onConfirm: onDiscardAll,
              title:
                kind === "untracked"
                  ? t("changeSection.deleteAllUntrackedTitle")
                  : t("changeSection.discardAllUnstagedTitle"),
              description:
                kind === "untracked"
                  ? t("changeSection.deleteAllUntrackedDescription")
                  : t("changeSection.discardAllUnstagedDescription"),
            })
          : null}
      </div>
    );
  };

  if (hideHeader) {
    return (
      <div className="group/headerless relative w-full">
        {content}
        {renderSectionActions("headerless")}
      </div>
    );
  }

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
            {orderedFiles.length}
          </span>
        </CollapsibleTrigger>

        {renderSectionActions("header")}
      </div>

      <CollapsibleContent>
        {content}
      </CollapsibleContent>
    </Collapsible>
  );
});
