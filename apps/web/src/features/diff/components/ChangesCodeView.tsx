'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CodeView, type CodeViewHandle } from '@pierre/diffs/react';
import type { CodeViewItem, DiffLineAnnotation, SelectedLineRange } from '@pierre/diffs';
import { parseDiffFromFile } from '@pierre/diffs';
import { useTheme } from 'next-themes';
import { ChevronRight, Copy, Loader2, MessageSquareText } from 'lucide-react';
import { getFileIconProps, toastManager } from '@workspace/ui';
import { gitApi } from '@/api/ws-api';
import { useGitStore } from '@/features/git/store/use-git-store';
import { useEditorStore } from '@/features/editor/store/use-editor-store';
import { useDiffSettingsStore } from '@/features/settings/store/diff-settings-store';
import { useContextParams } from '@/shared/hooks/use-context-params';
import {
  getDiffGroupKind,
  getDiffGroupTabLabel,
  getFilesForDiffGroup,
} from '@/features/diff/lib/diff-editor-paths';
import { useDiffWorkerPoolReady } from '@/features/diff/components/DiffWorkerPoolProvider';
import { DiffCodeViewSettingsMenu } from '@/features/diff/components/DiffCodeViewSettingsMenu';
import { DiffCodeViewScaffold } from '@/features/diff/components/DiffCodeViewScaffold';
import { DiffCopyAnnotation } from '@/features/diff/components/DiffCopyAnnotation';
import { sortByDiffTreePath } from '@/features/diff/lib/diff-file-order';
import {
  applyCollapseModeToItems,
  buildDiffSelectionInfo,
  filePathFromHeaderContext,
  formatSelectedRangeLabel,
  isCopyAnnotation,
  type CopyAnnotationMeta,
  toggleItemCollapsed,
  updateViewerDiffItem,
} from '@/features/diff/lib/diff-code-view-shared';
import {
  ATMOS_DIFF_THEME,
  buildSharedDiffViewOptions,
  CODE_VIEW_HOST_CLASS,
  getAtmosDiffThemeType,
} from '@/features/diff/lib/diff-view-constants';
import {
  findDiffItemIdForViewport,
  scrollCodeViewToItem,
} from '@/features/diff/lib/code-view-ui';
import { formatDiffSelectionForAI } from '@/shared/lib/format-selection-for-ai';
import { cn } from '@/shared/lib/utils';

const CODE_VIEW_BATCH_SIZE = 25;

function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, 0));
}

type StashedDiffPrompt = {
  itemId: string;
  key: string;
  prompt: string;
};

type StashedDiffPromptState = {
  scope: string;
  prompts: StashedDiffPrompt[];
};

type DraftPromptNoteState = {
  scope: string;
  notes: Record<string, string>;
};

const EMPTY_STASHED_PROMPTS: StashedDiffPrompt[] = [];
const EMPTY_DRAFT_NOTES: Record<string, string> = {};

interface ChangesCodeViewProps {
  repoPath: string;
  groupPath: string;
}

export function ChangesCodeView({ repoPath, groupPath }: ChangesCodeViewProps) {
  const { resolvedTheme } = useTheme();
  const groupKind = getDiffGroupKind(groupPath);
  const { effectiveContextId } = useContextParams();
  const compareRef = useGitStore((s) => s.compareRef);
  const stagedFiles = useGitStore((s) => s.stagedFiles);
  const unstagedFiles = useGitStore((s) => s.unstagedFiles);
  const untrackedFiles = useGitStore((s) => s.untrackedFiles);
  const compareFiles = useGitStore((s) => s.compareFiles);

  const clearNavigationTarget = useEditorStore((s) => s.clearNavigationTarget);
  const setDiffGroupActiveFile = useEditorStore((s) => s.setDiffGroupActiveFile);
  const selectedPath = useEditorStore((s) =>
    effectiveContextId ? s.diffGroupActiveFiles[effectiveContextId]?.[groupPath] : undefined,
  );
  const navigationTarget = useEditorStore((s) =>
    effectiveContextId
      ? s.navigationTargets[effectiveContextId]?.[groupPath] ?? null
      : null,
  );

  const workerPoolReady = useDiffWorkerPoolReady();
  const [isLoading, setIsLoading] = useState(true);
  const [hasLoadedAllItems, setHasLoadedAllItems] = useState(false);
  const [loadedItemVersion, setLoadedItemVersion] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [initialItems, setInitialItems] = useState<CodeViewItem<CopyAnnotationMeta>[]>(
    [],
  );
  const stashedPromptScope = `${repoPath}:${groupPath}`;
  const [stashedPromptState, setStashedPromptState] =
    useState<StashedDiffPromptState>(() => ({
      scope: stashedPromptScope,
      prompts: [],
    }));
  const stashedPrompts = useMemo(
    () =>
      stashedPromptState.scope === stashedPromptScope
        ? stashedPromptState.prompts
        : EMPTY_STASHED_PROMPTS,
    [stashedPromptScope, stashedPromptState],
  );
  const [draftNoteState, setDraftNoteState] =
    useState<DraftPromptNoteState>(() => ({
      scope: stashedPromptScope,
      notes: EMPTY_DRAFT_NOTES,
    }));
  const draftNotes = useMemo(
    () =>
      draftNoteState.scope === stashedPromptScope
        ? draftNoteState.notes
        : EMPTY_DRAFT_NOTES,
    [draftNoteState, stashedPromptScope],
  );
  const [pathByFileName, setPathByFileName] = useState<Map<string, string>>(
    () => new Map(),
  );
  const [viewerKey, setViewerKey] = useState(0);
  const [viewerMounted, setViewerMounted] = useState(false);
  const {
    diffStyle,
    showBackgrounds,
    lineNumbers,
    wordWrap,
    diffIndicators,
    loadSettings: loadDiffSettings,
    setDiffStyle,
    setShowBackgrounds,
    setLineNumbers,
    setWordWrap,
    setDiffIndicators,
  } = useDiffSettingsStore();
  const [collapseMode, setCollapseMode] = useState<'expanded' | 'collapsed'>(
    'expanded',
  );

  const codeViewRef = useRef<CodeViewHandle<CopyAnnotationMeta>>(null);
  const lastHandledNavRef = useRef<string | null>(null);
  const itemIdsRef = useRef<string[]>([]);
  const pendingAppendRef = useRef<CodeViewItem<CopyAnnotationMeta>[]>([]);
  const scrollActiveIdRef = useRef<string | null>(null);
  const loadedContentsRef = useRef<
    Map<string, { oldContent: string; newContent: string }>
  >(new Map());
  const copyKeyRef = useRef(0);
  const collapseModeRef = useRef(collapseMode);

  useEffect(() => {
    void loadDiffSettings();
  }, [loadDiffSettings]);

  useEffect(() => {
    collapseModeRef.current = collapseMode;
  }, [collapseMode]);

  const groupFiles = useMemo(() => {
    if (!groupKind) return [];
    return sortByDiffTreePath(
      getFilesForDiffGroup(groupKind, {
        stagedFiles,
        unstagedFiles,
        untrackedFiles,
        compareFiles,
        compareRef,
      }),
    );
  }, [
    groupKind,
    stagedFiles,
    unstagedFiles,
    untrackedFiles,
    compareFiles,
    compareRef,
  ]);

  const totalStats = useMemo(
    () => ({
      additions: groupFiles.reduce((sum, file) => sum + file.additions, 0),
      deletions: groupFiles.reduce((sum, file) => sum + file.deletions, 0),
    }),
    [groupFiles],
  );
  const treeItems = useMemo(
    () =>
      groupFiles.map((file) => ({
        path: file.path,
        additions: file.additions,
        deletions: file.deletions,
      })),
    [groupFiles],
  );
  const groupLabel = getDiffGroupTabLabel(groupPath);

  const renderHeaderPrefix = useCallback(
    (item: CodeViewItem<CopyAnnotationMeta>) => {
      if (item.type !== 'diff') return null;
      const filePath = filePathFromHeaderContext(item.fileDiff, pathByFileName);
      const collapsed = item.collapsed === true;
      const baseName = filePath.split('/').pop() || filePath;
      const iconProps = getFileIconProps({
        name: baseName,
        isDir: false,
        className: 'size-4 shrink-0',
      });
      const isEmptyDiff =
        item.fileDiff.splitLineCount === 0 &&
        item.fileDiff.unifiedLineCount === 0;

      return (
        <span className="inline-flex items-center gap-1">
          <button
            type="button"
            disabled={isEmptyDiff}
            aria-expanded={!isEmptyDiff && !collapsed}
            aria-label={
              isEmptyDiff
                ? undefined
                : collapsed
                  ? 'Expand diff'
                  : 'Collapse diff'
            }
            className={cn(
              'inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors',
              'hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-50',
            )}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              if (isEmptyDiff) return;
              toggleItemCollapsed(codeViewRef, item.id);
            }}
          >
            <ChevronRight
              className={cn(
                'size-4 transition-transform',
                !isEmptyDiff && !collapsed && 'rotate-90',
              )}
            />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element -- file icons are local UI asset descriptors from getFileIconProps */}
          <img {...iconProps} alt="" />
        </span>
      );
    },
    [pathByFileName],
  );

  const removeCopyAnnotation = useCallback((itemId: string, key: string) => {
    updateViewerDiffItem(codeViewRef.current, itemId, (item) => {
      if (!item.annotations?.length) return false;
      const next = item.annotations.filter((a) => a.metadata?.key !== key);
      if (next.length === item.annotations.length) return false;
      item.annotations = next;
      return true;
    });
  }, []);

  const removeStashedPrompt = useCallback(
    (itemId: string, key: string) => {
      setStashedPromptState((current) => {
        if (current.scope !== stashedPromptScope) return current;
        return {
          scope: current.scope,
          prompts: current.prompts.filter(
            (entry) => entry.itemId !== itemId || entry.key !== key,
          ),
        };
      });
    },
    [stashedPromptScope],
  );

  const removeDraftNote = useCallback(
    (key: string) => {
      setDraftNoteState((current) => {
        if (current.scope !== stashedPromptScope || !(key in current.notes)) {
          return current;
        }
        const notes = { ...current.notes };
        delete notes[key];
        return { scope: current.scope, notes };
      });
    },
    [stashedPromptScope],
  );

  const handleDraftNoteChange = useCallback(
    (key: string, note: string) => {
      setDraftNoteState((current) => ({
        scope: stashedPromptScope,
        notes: {
          ...(current.scope === stashedPromptScope ? current.notes : EMPTY_DRAFT_NOTES),
          [key]: note,
        },
      }));
    },
    [stashedPromptScope],
  );

  const handleDismissAnnotation = useCallback(
    (itemId: string, key: string) => {
      removeStashedPrompt(itemId, key);
      removeDraftNote(key);
      removeCopyAnnotation(itemId, key);
    },
    [removeCopyAnnotation, removeDraftNote, removeStashedPrompt],
  );

  const buildPromptForAnnotation = useCallback(
    (itemId: string, key: string, note: string) => {
      const viewer = codeViewRef.current;
      const item = viewer?.getItem(itemId);
      const contents = loadedContentsRef.current.get(itemId);
      if (item?.type !== 'diff' || !contents) return null;

      const annotation = item.annotations?.find(
        (a) => isCopyAnnotation(a) && a.metadata.key === key,
      );
      if (!annotation || !isCopyAnnotation(annotation)) return null;

      const selectionInfo = buildDiffSelectionInfo({
        filePath: annotation.metadata.filePath,
        fileDiff: item.fileDiff,
        contents,
        range: annotation.metadata.range,
      });
      return selectionInfo
        ? formatDiffSelectionForAI(selectionInfo, note)
        : null;
    },
    [],
  );

  const handleCopyAnnotation = useCallback(
    (itemId: string, key: string, note: string) => {
      const prompt = buildPromptForAnnotation(itemId, key, note);
      if (!prompt) {
        toastManager.add({
          title: 'Nothing to copy',
          type: 'error',
        });
        return;
      }

      void navigator.clipboard.writeText(prompt).catch(() =>
        toastManager.add({
          title: 'Failed to copy prompt',
          type: 'error',
        }),
      );
      removeStashedPrompt(itemId, key);
      removeDraftNote(key);
      removeCopyAnnotation(itemId, key);
    },
    [
      buildPromptForAnnotation,
      removeCopyAnnotation,
      removeDraftNote,
      removeStashedPrompt,
    ],
  );

  const handleStashAnnotation = useCallback(
    (itemId: string, key: string, note: string) => {
      const prompt = buildPromptForAnnotation(itemId, key, note);
      if (!prompt) {
        toastManager.add({
          title: 'Nothing to stash',
          type: 'error',
        });
        return;
      }

      setStashedPromptState((current) => ({
        scope: stashedPromptScope,
        prompts:
          current.scope === stashedPromptScope
            ? [
                ...current.prompts.filter(
                  (entry) => entry.itemId !== itemId || entry.key !== key,
                ),
                { itemId, key, prompt },
              ]
            : [{ itemId, key, prompt }],
      }));
    },
    [buildPromptForAnnotation, stashedPromptScope],
  );

  const handleCopyStashedPrompts = useCallback(() => {
    if (stashedPrompts.length === 0) return;
    const prompt = stashedPrompts
      .map((entry, index) => `# Comment ${index + 1}\n\n${entry.prompt}`)
      .join('\n\n---\n\n');

    void navigator.clipboard.writeText(prompt).then(
      () => {
        const copiedKeys = new Set(stashedPrompts.map((entry) => entry.key));
        for (const entry of stashedPrompts) {
          removeCopyAnnotation(entry.itemId, entry.key);
        }
        setDraftNoteState((current) => {
          if (current.scope !== stashedPromptScope) return current;
          return {
            scope: current.scope,
            notes: Object.fromEntries(
              Object.entries(current.notes).filter(([key]) => !copiedKeys.has(key)),
            ),
          };
        });
        setStashedPromptState({ scope: stashedPromptScope, prompts: [] });
      },
      () =>
        toastManager.add({
          title: 'Failed to copy prompt',
          type: 'error',
        }),
    );
  }, [removeCopyAnnotation, stashedPromptScope, stashedPrompts]);

  const stashedPromptChip = useMemo(() => {
    if (stashedPrompts.length === 0) return null;
    return (
      <button
        type="button"
        onClick={handleCopyStashedPrompts}
        className={cn(
          'group/comment-chip inline-flex h-7 max-w-[58px] shrink-0 items-center justify-start overflow-hidden rounded-md border border-foreground bg-foreground px-2 text-xs font-semibold text-background shadow-sm',
          'transition-[max-width,background-color,border-color,color,box-shadow] duration-300 ease-out hover:max-w-[132px] hover:bg-background hover:text-foreground hover:shadow-md',
          'dark:border-foreground dark:bg-foreground dark:text-background dark:hover:bg-background dark:hover:text-foreground',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
        )}
        aria-label={`Copy ${stashedPrompts.length} stashed prompt comment${stashedPrompts.length === 1 ? '' : 's'}`}
        title="Copy Prompt"
      >
        <span className="relative mr-1.5 flex size-3.5 shrink-0 items-center justify-center">
          <MessageSquareText className="absolute size-3.5 transition-all duration-300 ease-out group-hover/comment-chip:scale-75 group-hover/comment-chip:opacity-0" />
          <Copy className="absolute size-3.5 scale-75 opacity-0 transition-all duration-300 ease-out group-hover/comment-chip:scale-100 group-hover/comment-chip:opacity-100" />
        </span>
        <span className="w-4 overflow-hidden text-center text-xs tabular-nums transition-[width,opacity,transform] duration-300 ease-out group-hover/comment-chip:w-0 group-hover/comment-chip:-translate-x-1 group-hover/comment-chip:opacity-0">
          {stashedPrompts.length}
        </span>
        <span className="ml-0 max-w-0 whitespace-nowrap opacity-0 transition-[max-width,opacity,margin-left] duration-300 ease-out group-hover/comment-chip:max-w-24 group-hover/comment-chip:opacity-100">
          Copy Prompt
        </span>
      </button>
    );
  }, [handleCopyStashedPrompts, stashedPrompts.length]);

  const openCopyAnnotation = useCallback(
    (itemId: string, range: SelectedLineRange) => {
      const viewer = codeViewRef.current;
      if (viewer == null) return;

      const side = range.endSide ?? range.side;
      if (!side) return;

      const lineNumber = range.end;
      const key = `copy-${copyKeyRef.current++}`;

      updateViewerDiffItem(viewer, itemId, (item) => {
        const removedEmptyKeys: string[] = [];
        const stashedKeys = new Set(stashedPrompts.map((entry) => entry.key));
        const existingAnnotations = (item.annotations ?? []).filter((annotation) => {
          if (!isCopyAnnotation(annotation)) return true;
          if (stashedKeys.has(annotation.metadata.key)) return true;
          if ((draftNotes[annotation.metadata.key] ?? '').trim()) return true;
          removedEmptyKeys.push(annotation.metadata.key);
          return false;
        });

        const hasExistingRange = existingAnnotations.some((annotation) => {
          if (!isCopyAnnotation(annotation)) return false;
          const existingRange = annotation.metadata.range;
          return (
            annotation.side === side &&
            existingRange.side === range.side &&
            existingRange.endSide === range.endSide &&
            existingRange.start === range.start &&
            existingRange.end === range.end
          );
        });
        if (hasExistingRange) return false;

        const nextAnnotation: DiffLineAnnotation<CopyAnnotationMeta> = {
          side,
          lineNumber,
          metadata: { kind: 'copy', key, filePath: itemId, range },
        };
        item.annotations = [...existingAnnotations, nextAnnotation];
        if (removedEmptyKeys.length > 0) {
          setDraftNoteState((current) => {
            if (current.scope !== stashedPromptScope) return current;
            const removed = new Set(removedEmptyKeys);
            return {
              scope: current.scope,
              notes: Object.fromEntries(
                Object.entries(current.notes).filter(([entryKey]) => !removed.has(entryKey)),
              ),
            };
          });
        }
        return true;
      });
    },
    [draftNotes, stashedPromptScope, stashedPrompts],
  );

  const renderAnnotation = useCallback(
    (annotation: DiffLineAnnotation<CopyAnnotationMeta>) => {
      if (!isCopyAnnotation(annotation)) return null;
      const isStashed = stashedPrompts.some(
        (entry) =>
          entry.itemId === annotation.metadata.filePath &&
          entry.key === annotation.metadata.key,
      );
      return (
        <DiffCopyAnnotation
          annotation={annotation}
          itemId={annotation.metadata.filePath}
          isStashed={isStashed}
          note={draftNotes[annotation.metadata.key] ?? ''}
          onNoteChange={handleDraftNoteChange}
          onCopy={handleCopyAnnotation}
          onStash={handleStashAnnotation}
          onDismiss={handleDismissAnnotation}
          lineLabel={formatSelectedRangeLabel(annotation.metadata.range)}
        />
      );
    },
    [
      handleCopyAnnotation,
      handleDismissAnnotation,
      handleDraftNoteChange,
      handleStashAnnotation,
      draftNotes,
      stashedPrompts,
    ],
  );

  useEffect(() => {
    let cancelled = false;

    if (!groupKind) {
      queueMicrotask(() => {
        if (cancelled) return;
        setInitialItems([]);
        setIsLoading(false);
      });
      return () => {
        cancelled = true;
      };
    }

    pendingAppendRef.current = [];
    loadedContentsRef.current = new Map();
    lastHandledNavRef.current = null;
    scrollActiveIdRef.current = null;
    const nextPathByFileName = new Map<string, string>();

    queueMicrotask(() => {
      if (cancelled) return;
      setViewerKey((key) => key + 1);
      setViewerMounted(false);
      setInitialItems([]);
      setHasLoadedAllItems(false);
      setLoadedItemVersion(0);
      setPathByFileName(new Map());
    });

    const loadFile = async (file: (typeof groupFiles)[number]) => {
      const diff = await gitApi.getFileDiff(repoPath, file.path);
      const fileDiff = parseDiffFromFile(
        { name: file.path, contents: diff.old_content },
        { name: file.path, contents: diff.new_content },
      );
      nextPathByFileName.set(fileDiff.name, file.path);
      return {
        id: file.path,
        fileDiff,
        oldContent: diff.old_content,
        newContent: diff.new_content,
      };
    };

    const load = async () => {
      setIsLoading(true);
      setError(null);

      try {
        let hasPublishedInitial = false;

        for (let offset = 0; offset < groupFiles.length; offset += CODE_VIEW_BATCH_SIZE) {
          if (cancelled) return;

          const batch = groupFiles.slice(offset, offset + CODE_VIEW_BATCH_SIZE);
          const results = await Promise.all(
            batch.map(async (file) => {
              try {
                return await loadFile(file);
              } catch (err) {
                console.error(`Failed to load diff for ${file.path}:`, err);
                return null;
              }
            }),
          );

          if (cancelled) return;

          const codeItems: CodeViewItem<CopyAnnotationMeta>[] = [];
          for (const result of results) {
            if (!result) continue;
            loadedContentsRef.current.set(result.id, {
              oldContent: result.oldContent,
              newContent: result.newContent,
            });
            codeItems.push({
              id: result.id,
              type: 'diff',
              fileDiff: result.fileDiff,
              collapsed: collapseModeRef.current === 'collapsed',
            });
          }

          if (codeItems.length === 0) continue;

          if (!hasPublishedInitial) {
            hasPublishedInitial = true;
            itemIdsRef.current = codeItems.map((item) => item.id);
            setPathByFileName(new Map(nextPathByFileName));
            setInitialItems(codeItems);
            setLoadedItemVersion((value) => value + 1);
            setIsLoading(false);
            await yieldToBrowser();
          } else {
            itemIdsRef.current = [
              ...itemIdsRef.current,
              ...codeItems.map((item) => item.id),
            ];
            setPathByFileName(new Map(nextPathByFileName));
            const viewer = codeViewRef.current;
            if (viewer != null) {
              viewer.addItems(codeItems);
              setLoadedItemVersion((value) => value + 1);
              await yieldToBrowser();
            } else {
              pendingAppendRef.current.push(...codeItems);
            }
          }
        }

        if (!cancelled && !hasPublishedInitial) {
          itemIdsRef.current = [];
          setIsLoading(false);
        }
        if (!cancelled) {
          setHasLoadedAllItems(true);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load changes');
          setInitialItems([]);
          setIsLoading(false);
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [groupFiles, groupKind, repoPath]);

  useEffect(() => {
    if (!viewerMounted || pendingAppendRef.current.length === 0) return;
    let cancelled = false;
    const pending = pendingAppendRef.current;
    pendingAppendRef.current = [];
    codeViewRef.current?.addItems(pending);
    queueMicrotask(() => {
      if (!cancelled) {
        setLoadedItemVersion((value) => value + 1);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [viewerMounted, initialItems]);

  useEffect(() => {
    if (!effectiveContextId || itemIdsRef.current.length === 0) return;
    if (selectedPath && !hasLoadedAllItems) return;
    if (selectedPath && itemIdsRef.current.includes(selectedPath)) return;
    if (selectedPath && navigationTarget?.diffFilePath === selectedPath) return;
    setDiffGroupActiveFile(groupPath, itemIdsRef.current[0], effectiveContextId);
  }, [
    effectiveContextId,
    groupPath,
    hasLoadedAllItems,
    initialItems,
    navigationTarget?.diffFilePath,
    selectedPath,
    setDiffGroupActiveFile,
    viewerKey,
  ]);

  const codeViewOptions = useMemo(
    () => ({
      ...buildSharedDiffViewOptions({
        theme: ATMOS_DIFF_THEME,
        themeType: getAtmosDiffThemeType(resolvedTheme),
        diffStyle,
        wordWrap,
        disableBackground: !showBackgrounds,
        lineNumbers,
        diffIndicators,
        enableLineSelection: true,
        enableGutterUtility: true,
      }),
      onLineSelectionEnd(
        range: SelectedLineRange | null,
        context: { item: CodeViewItem<CopyAnnotationMeta> },
      ) {
        if (!range || context.item.type !== 'diff') return;
        openCopyAnnotation(context.item.id, range);
      },
      onGutterUtilityClick(
        range: SelectedLineRange,
        context: { item: CodeViewItem<CopyAnnotationMeta> },
      ) {
        if (context.item.type !== 'diff') return;
        openCopyAnnotation(context.item.id, range);
      },
    }),
    [
      diffStyle,
      resolvedTheme,
      wordWrap,
      showBackgrounds,
      lineNumbers,
      diffIndicators,
      openCopyAnnotation,
    ],
  );

  const handleViewerRef = useCallback(
    (handle: CodeViewHandle<CopyAnnotationMeta> | null) => {
      codeViewRef.current = handle;
      setViewerMounted(handle != null);
    },
    [],
  );

  const handleToggleCollapseMode = useCallback(() => {
    const next = collapseMode === 'expanded' ? 'collapsed' : 'expanded';
    setCollapseMode(next);
    applyCollapseModeToItems(codeViewRef, itemIdsRef.current, next);
  }, [collapseMode]);

  useEffect(() => {
    const instance = codeViewRef.current?.getInstance();
    if (instance == null || !effectiveContextId) return;

    return instance.subscribeToScroll((scrollTop, viewer) => {
      if (itemIdsRef.current.length === 0) return;
      const activeId = findDiffItemIdForViewport(
        viewer,
        itemIdsRef.current,
      );
      if (activeId == null || activeId === scrollActiveIdRef.current) return;
      scrollActiveIdRef.current = activeId;
      setDiffGroupActiveFile(groupPath, activeId, effectiveContextId);
    });
  }, [effectiveContextId, groupPath, setDiffGroupActiveFile, viewerMounted, viewerKey]);

  const navigationScrollKey = navigationTarget?.diffFilePath
    ? [
        navigationTarget.diffFilePath,
        navigationTarget.line ?? '',
        navigationTarget.reviewCommentGuid ?? '',
        navigationTarget.reviewMessageGuid ?? '',
      ].join(':')
    : null;

  useEffect(() => {
    if (
      !navigationTarget?.diffFilePath ||
      isLoading ||
      !navigationScrollKey ||
      !viewerMounted
    ) {
      return;
    }
    const fileId = navigationTarget.diffFilePath;
    if (!itemIdsRef.current.includes(fileId)) return;
    if (lastHandledNavRef.current === navigationScrollKey) return;
    if (effectiveContextId) {
      setDiffGroupActiveFile(groupPath, fileId, effectiveContextId);
    }

    requestAnimationFrame(() => {
      if (!codeViewRef.current?.getItem(fileId)) {
        return;
      }
      lastHandledNavRef.current = navigationScrollKey;
      scrollCodeViewToItem(codeViewRef.current, fileId, {
        line: navigationTarget.line,
        behavior: 'smooth',
      });
      if (
        effectiveContextId &&
        (navigationTarget.line ||
          navigationTarget.reviewCommentGuid ||
          navigationTarget.reviewMessageGuid)
      ) {
        clearNavigationTarget(groupPath, effectiveContextId);
      }
    });
  }, [
    navigationTarget,
    navigationScrollKey,
    loadedItemVersion,
    isLoading,
    viewerMounted,
    groupPath,
    effectiveContextId,
    clearNavigationTarget,
    setDiffGroupActiveFile,
  ]);

  if (!groupKind) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        Unknown changes group
      </div>
    );
  }

  if (isLoading || !workerPoolReady) {
    return (
      <div className="flex h-full flex-col overflow-hidden bg-background">
        <DiffCodeViewScaffold
          items={treeItems}
          selectedPath={selectedPath}
          ariaLabel={`${groupLabel} files`}
          loading
          loadingTreeLabel={groupLabel}
          defaultTreeVisible={false}
          toolbar={
            <div className="flex items-center gap-2">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <span className="truncate text-sm font-medium text-foreground">{groupLabel}</span>
              </div>
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
            </div>
          }
          onSelectFile={() => {}}
        >
          <div />
        </DiffCodeViewScaffold>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center bg-background">
        <div className="text-center">
          <p className="text-red-500 mb-2">Error loading changes</p>
          <p className="text-sm text-muted-foreground">{error}</p>
        </div>
      </div>
    );
  }

  if (initialItems.length === 0) {
    return (
      <div className="flex h-full items-center justify-center bg-background text-muted-foreground text-sm">
        No files in this group
      </div>
    );
  }

  const handleSelectFile = (path: string) => {
    if (effectiveContextId) {
      setDiffGroupActiveFile(groupPath, path, effectiveContextId);
    }
    scrollCodeViewToItem(codeViewRef.current, path, { behavior: 'smooth' });
  };
  const toolbar = (
    <div className="flex items-center gap-2">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span className="truncate text-sm font-medium text-foreground">{groupLabel}</span>
        <span className="shrink-0 text-xs text-muted-foreground">
          {treeItems.length} file{treeItems.length === 1 ? '' : 's'}
        </span>
        {compareRef ? (
          <span className="shrink-0 text-xs text-muted-foreground">vs {compareRef}</span>
        ) : null}
        {stashedPromptChip}
      </div>
      {(totalStats.additions > 0 || totalStats.deletions > 0) && (
        <div className="flex shrink-0 items-center gap-2 text-[11px] font-mono font-medium">
          <span className="text-emerald-500">+{totalStats.additions}</span>
          <span className="text-red-500">-{totalStats.deletions}</span>
        </div>
      )}
      <DiffCodeViewSettingsMenu
        diffStyle={diffStyle}
        onDiffStyleChange={setDiffStyle}
        showBackgrounds={showBackgrounds}
        onShowBackgroundsChange={setShowBackgrounds}
        lineNumbers={lineNumbers}
        onLineNumbersChange={setLineNumbers}
        wordWrap={wordWrap}
        onWordWrapChange={setWordWrap}
        diffIndicators={diffIndicators}
        onDiffIndicatorsChange={setDiffIndicators}
        collapseMode={collapseMode}
        onToggleCollapseMode={handleToggleCollapseMode}
      />
    </div>
  );

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      <DiffCodeViewScaffold
        items={treeItems}
        selectedPath={selectedPath}
        ariaLabel={`${groupLabel} files`}
        toolbar={toolbar}
        defaultTreeVisible={false}
        onSelectFile={handleSelectFile}
      >
        <CodeView
          key={`${groupPath}:${viewerKey}`}
          ref={handleViewerRef}
          initialItems={initialItems}
          options={codeViewOptions}
          renderHeaderPrefix={renderHeaderPrefix}
          renderAnnotation={renderAnnotation}
          className={CODE_VIEW_HOST_CLASS}
        />
      </DiffCodeViewScaffold>
    </div>
  );
}
