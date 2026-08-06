'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CodeView,
  EditProvider,
  type CodeViewHandle,
  type CreateEditor,
} from '@pierre/diffs/react';
import type { CodeViewItem, FileContents, SelectedLineRange } from '@pierre/diffs';
import { parseDiffFromFile } from '@pierre/diffs';
import { Editor } from '@pierre/diffs/edit';
import { useTranslations } from 'next-intl';
import { useTheme } from 'next-themes';
import { Loader2, Pencil, RotateCcw, Save } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { toastManager } from '@workspace/ui';
import { fsApi, gitApi } from '@/api/ws-api';
import { useGitStore } from '@/features/git/store/use-git-store';
import {
  useGitChangedFilesQuery,
  GIT_WORKTREE_PARAMS,
  invalidateGitQueries,
} from '@/features/git/hooks/use-git-changed-files-query';
import { useGitStatusQuery } from '@/features/git/hooks/use-git-status-query';
import { computeCompareParams, selectCompareChangedFiles, isCompareQueryEnabled, EMPTY_CHANGED_FILES } from '@/features/git/lib/git-query-options';
import { useEditorStore, type FileNavigationTarget } from '@/features/editor/store/use-editor-store';
import { useDiffSettingsStore } from '@/features/settings/store/diff-settings-store';
import { useContextParams } from '@/shared/hooks/use-context-params';
import {
  DIFF_GROUP_TAB_LABELS,
  type DiffChangeGroupKind,
  getDiffGroupKind,
  getFilesForDiffGroup,
} from '@/features/diff/lib/diff-editor-paths';
import { useDiffWorkerPoolReady } from '@/features/diff/components/DiffWorkerPoolProvider';
import { DiffCodeViewSettingsMenu } from '@/features/diff/components/DiffCodeViewSettingsMenu';
import { DiffCodeViewScaffold } from '@/features/diff/components/DiffCodeViewScaffold';
import {
  useDiffPromptStash,
  type LoadedDiffContents,
} from '@/features/diff/components/useDiffPromptStash';
import type { AgentFixContextRef } from '@/features/agent-fix/types';
import { sortByDiffTreePath } from '@/features/diff/lib/diff-file-order';
import {
  applyCollapseModeToItems,
  diffSideCacheKey,
  getNextItemVersion,
  isBinaryAnnotation,
  type DiffListAnnotationMeta,
} from '@/features/diff/lib/diff-code-view-shared';
import {
  binaryDiffPlaceholders,
  isLikelyBinaryPath,
  isNonTextDiff,
} from '@/features/diff/lib/diff-content-kind';
import type { GitFileDiffResponse } from '@/api/ws-api-types';
import {
  ATMOS_DIFF_THEME,
  buildSharedDiffViewOptions,
  CODE_VIEW_HOST_CLASS,
  getAtmosDiffThemeType,
} from '@/features/diff/lib/diff-view-constants';
import {
  findDiffItemIdForViewport,
  renderDiffHeaderPrefix,
  scrollCodeViewToItem,
} from '@/features/diff/lib/code-view-ui';
import { cn } from '@/shared/lib/utils';

const CODE_VIEW_BATCH_SIZE = 25;
const FULL_COMMIT_HASH_RE = /^[0-9a-f]{40}$/i;

/** Worktree change groups whose new side maps to a local file we can write. */
function isEditableWorktreeGroup(
  kind: DiffChangeGroupKind | null,
): kind is 'staged' | 'unstaged' | 'untracked' {
  return kind === 'staged' || kind === 'unstaged' || kind === 'untracked';
}

function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, 0));
}

function formatCommitRefLabel(ref: string): string {
  return FULL_COMMIT_HASH_RE.test(ref) ? ref.slice(0, 7) : ref;
}

function toAbsolutePath(repoPath: string, relativePath: string): string {
  if (relativePath.startsWith('/')) {
    return relativePath;
  }
  const normalizedRepo = repoPath.endsWith('/') ? repoPath.slice(0, -1) : repoPath;
  return `${normalizedRepo}/${relativePath}`;
}

function rebuildDiffItem(
  path: string,
  contents: LoadedDiffContents,
  base: CodeViewItem<DiffListAnnotationMeta>,
  edit: boolean,
): CodeViewItem<DiffListAnnotationMeta> {
  if (base.type !== 'diff') return base;
  const fileDiff = parseDiffFromFile(
    {
      name: path,
      contents: contents.oldContent,
      cacheKey: diffSideCacheKey(path, contents.oldContent),
    },
    {
      name: path,
      contents: contents.newContent,
      cacheKey: diffSideCacheKey(path, contents.newContent),
    },
  );
  return {
    ...base,
    fileDiff,
    edit,
    version: getNextItemVersion(base),
    collapsed: false,
  };
}

interface ChangesCodeViewProps {
  repoPath: string;
  groupPath: string;
  agentFixContext?: AgentFixContextRef | null;
  contextId?: string | null;
  navigationTarget?: FileNavigationTarget | null;
}

export function ChangesCodeView({
  agentFixContext,
  repoPath,
  groupPath,
  contextId,
  navigationTarget: navigationTargetProp,
}: ChangesCodeViewProps) {
  const t = useTranslations('diff.codeView');
  const loadChangesFallbackRef = useRef(t('errors.loadChangesFallback'));
  const { resolvedTheme } = useTheme();
  const groupKind = getDiffGroupKind(groupPath);
  const { effectiveContextId } = useContextParams();
  const activeContextId = contextId ?? effectiveContextId;
  const compareMode = useGitStore((s) => s.compareMode);
  const compareBaseRef = useGitStore((s) => s.compareBaseRef);
  const effectiveGroupKind =
    groupKind === 'compared' && compareBaseRef ? 'commit' : groupKind;

  const statusQuery = useGitStatusQuery(repoPath);
  const defaultBranch = statusQuery.data?.default_branch ?? null;
  const compareParams = computeCompareParams(compareMode, defaultBranch, compareBaseRef);

  const worktreeQuery = useGitChangedFilesQuery(repoPath, GIT_WORKTREE_PARAMS);
  const compareQuery = useGitChangedFilesQuery(
    isCompareQueryEnabled(compareMode, defaultBranch) ? repoPath : null,
    compareParams,
  );

  const stagedFiles = worktreeQuery.data?.staged_files ?? EMPTY_CHANGED_FILES;
  const unstagedFiles = worktreeQuery.data?.unstaged_files ?? EMPTY_CHANGED_FILES;
  const untrackedFiles = worktreeQuery.data?.untracked_files ?? EMPTY_CHANGED_FILES;
  const { files: compareFiles, compareRef } = selectCompareChangedFiles(compareQuery.data);
  const queriesLoading =
    statusQuery.isLoading ||
    worktreeQuery.isLoading ||
    (isCompareQueryEnabled(compareMode, defaultBranch) && compareQuery.isLoading);

  const clearNavigationTarget = useEditorStore((s) => s.clearNavigationTarget);
  const setDiffGroupActiveFile = useEditorStore((s) => s.setDiffGroupActiveFile);
  const storeSelectedPath = useEditorStore((s) =>
    activeContextId ? s.diffGroupActiveFiles[activeContextId]?.[groupPath] : undefined,
  );
  const storeNavigationTarget = useEditorStore((s) =>
    activeContextId
      ? s.navigationTargets[activeContextId]?.[groupPath] ?? null
      : null,
  );
  const navigationTarget =
    navigationTargetProp === undefined ? storeNavigationTarget : navigationTargetProp;
  const selectedPath = navigationTargetProp?.diffFilePath ?? storeSelectedPath;

  const workerPoolReady = useDiffWorkerPoolReady();
  const [isLoading, setIsLoading] = useState(true);
  const [hasLoadedAllItems, setHasLoadedAllItems] = useState(false);
  const [loadedItemVersion, setLoadedItemVersion] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [initialItems, setInitialItems] = useState<CodeViewItem<DiffListAnnotationMeta>[]>(
    [],
  );
  const stashedPromptScope = `${repoPath}:${groupPath}`;
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
  const [editingPath, setEditingPath] = useState<string | null>(null);
  const [isEditDirty, setIsEditDirty] = useState(false);
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const codeViewRef = useRef<CodeViewHandle<DiffListAnnotationMeta>>(null);
  const lastHandledNavRef = useRef<string | null>(null);
  const itemIdsRef = useRef<string[]>([]);
  const pendingAppendRef = useRef<CodeViewItem<DiffListAnnotationMeta>[]>([]);
  const scrollActiveIdRef = useRef<string | null>(null);
  const loadedContentsRef = useRef<Map<string, LoadedDiffContents>>(new Map());
  const collapseModeRef = useRef(collapseMode);
  const draftContentsRef = useRef<Map<string, string>>(new Map());
  const editingPathRef = useRef<string | null>(null);
  const isEditDirtyRef = useRef(false);
  const isSavingEditRef = useRef(false);
  const stageFiles = useGitStore((s) => s.stageFiles);
  const { openCopyAnnotation, renderAnnotation, stashedPromptChip } =
    useDiffPromptStash({
      agentFixContext,
      scope: stashedPromptScope,
      repoPath,
      viewerRef: codeViewRef,
      loadedContentsRef,
    });

  useEffect(() => {
    void loadDiffSettings();
  }, [loadDiffSettings]);

  useEffect(() => {
    loadChangesFallbackRef.current = t('errors.loadChangesFallback');
  }, [t]);

  useEffect(() => {
    collapseModeRef.current = collapseMode;
  }, [collapseMode]);

  useEffect(() => {
    editingPathRef.current = editingPath;
  }, [editingPath]);

  useEffect(() => {
    isEditDirtyRef.current = isEditDirty;
  }, [isEditDirty]);

  const canEditWorktree = isEditableWorktreeGroup(effectiveGroupKind);

  const createDiffEditor = useCallback<CreateEditor<DiffListAnnotationMeta>>(
    (options) => new Editor(options),
    [],
  );

  const isBinaryItem = useCallback((item: CodeViewItem<DiffListAnnotationMeta> | undefined) => {
    if (item == null || item.type !== 'diff') return true;
    return item.annotations?.some((annotation) => isBinaryAnnotation(annotation)) ?? false;
  }, []);

  const setItemEditMode = useCallback((path: string, edit: boolean) => {
    const viewer = codeViewRef.current;
    const item = viewer?.getItem(path);
    if (viewer == null || item == null || item.type !== 'diff') return false;
    if (isBinaryItem(item)) return false;
    item.edit = edit;
    item.collapsed = false;
    item.version = getNextItemVersion(item);
    viewer.updateItem(item);
    return true;
  }, [isBinaryItem]);

  const handleEnterEdit = useCallback((path: string) => {
    if (!canEditWorktree) return;
    const currentEditing = editingPathRef.current;
    if (currentEditing && currentEditing !== path) {
      if (isEditDirtyRef.current) {
        toastManager.add({
          title: t('edit.unsavedTitle'),
          description: t('edit.unsavedDescription'),
          type: 'error',
        });
        return;
      }
      setItemEditMode(currentEditing, false);
      draftContentsRef.current.delete(currentEditing);
    }
    if (!setItemEditMode(path, true)) return;
    const original = loadedContentsRef.current.get(path)?.newContent ?? '';
    draftContentsRef.current.set(path, original);
    setEditingPath(path);
    setIsEditDirty(false);
  }, [canEditWorktree, setItemEditMode, t]);

  const handleExitEdit = useCallback((path: string) => {
    setItemEditMode(path, false);
    draftContentsRef.current.delete(path);
    if (editingPathRef.current === path) {
      setEditingPath(null);
      setIsEditDirty(false);
    }
  }, [setItemEditMode]);

  const handleResetEdit = useCallback(() => {
    const path = editingPathRef.current;
    if (path == null) return;
    const viewer = codeViewRef.current;
    const item = viewer?.getItem(path);
    const original = loadedContentsRef.current.get(path);
    if (viewer == null || item == null || item.type !== 'diff' || original == null) {
      return;
    }
    // End the session then re-open so the editor document is rebuilt from the
    // original new-side contents (pierre owns the live document while edit is on).
    const closed = rebuildDiffItem(path, original, item, false);
    viewer.updateItem(closed);
    const reopenedBase = viewer.getItem(path) ?? closed;
    const reopened = rebuildDiffItem(path, original, reopenedBase, true);
    viewer.updateItem(reopened);
    draftContentsRef.current.set(path, original.newContent);
    setIsEditDirty(false);
  }, []);

  const handleSaveEdit = useCallback(async () => {
    const path = editingPathRef.current;
    if (path == null || isSavingEditRef.current) return;
    const draft =
      draftContentsRef.current.get(path) ??
      loadedContentsRef.current.get(path)?.newContent;
    if (draft == null) return;

    isSavingEditRef.current = true;
    setIsSavingEdit(true);
    try {
      const absolutePath = toAbsolutePath(repoPath, path);
      await fsApi.writeFile(absolutePath, draft);
      if (effectiveGroupKind === 'staged') {
        await stageFiles([path]);
      }
      const previous = loadedContentsRef.current.get(path);
      loadedContentsRef.current.set(path, {
        oldContent: previous?.oldContent ?? '',
        newContent: draft,
      });
      draftContentsRef.current.set(path, draft);

      const viewer = codeViewRef.current;
      const item = viewer?.getItem(path);
      const contents = loadedContentsRef.current.get(path);
      if (viewer != null && item != null && item.type === 'diff' && contents != null) {
        viewer.updateItem(rebuildDiffItem(path, contents, item, false));
      }

      setEditingPath(null);
      setIsEditDirty(false);
      draftContentsRef.current.delete(path);
      await invalidateGitQueries(repoPath);
    } catch (error) {
      toastManager.add({
        title: t('edit.saveFailedTitle'),
        description:
          error instanceof Error ? error.message : t('edit.saveFailedFallback'),
        type: 'error',
      });
    } finally {
      isSavingEditRef.current = false;
      setIsSavingEdit(false);
    }
  }, [effectiveGroupKind, repoPath, stageFiles, t]);

  const handleEditButtonClick = useCallback(() => {
    if (editingPath != null) {
      if (isEditDirty) {
        void handleSaveEdit();
        return;
      }
      handleExitEdit(editingPath);
      return;
    }
    if (selectedPath) {
      handleEnterEdit(selectedPath);
    }
  }, [
    editingPath,
    handleEnterEdit,
    handleExitEdit,
    handleSaveEdit,
    isEditDirty,
    selectedPath,
  ]);

  const handleItemEditChange = useCallback(
    (item: CodeViewItem<DiffListAnnotationMeta>, file: FileContents) => {
      const original = loadedContentsRef.current.get(item.id)?.newContent ?? '';
      draftContentsRef.current.set(item.id, file.contents);
      if (editingPathRef.current === item.id) {
        setIsEditDirty(file.contents !== original);
      }
    },
    [],
  );

  // Cmd/Ctrl+S saves while a worktree diff is being edited.
  useEffect(() => {
    if (!canEditWorktree || editingPath == null) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 's') {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      if (!isEditDirtyRef.current) return;
      void handleSaveEdit();
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [canEditWorktree, editingPath, handleSaveEdit]);

  // Drop edit session when the group reloads or leaves worktree mode.
  useEffect(() => {
    setEditingPath(null);
    setIsEditDirty(false);
    draftContentsRef.current.clear();
  }, [groupPath, viewerKey, canEditWorktree]);

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
  }, [groupKind, stagedFiles, unstagedFiles, untrackedFiles, compareFiles, compareRef]);

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
        gitStatus: file.status,
        additions: file.additions,
        deletions: file.deletions,
        isBinary: Boolean(file.is_binary) || isLikelyBinaryPath(file.path),
      })),
    [groupFiles],
  );
  const groupLabel = effectiveGroupKind
    ? DIFF_GROUP_TAB_LABELS[effectiveGroupKind]
    : '';
  const displayReferenceLabel =
    effectiveGroupKind === 'commit'
      ? compareBaseRef ?? compareRef
        ? t('commitRef', {
            commitRef: formatCommitRefLabel((compareBaseRef ?? compareRef)!),
          })
        : null
      : compareRef
        ? t('compareRef', { compareRef })
        : null;
  const diffRequestOptions = useMemo(() => {
    switch (effectiveGroupKind) {
      case 'branch':
      case 'compared':
        return {
          againstIndex: false,
          baseRef: compareRef,
          commitRef: null,
        };
      case 'commit':
        return {
          againstIndex: false,
          baseRef: null,
          commitRef: compareBaseRef ?? compareRef,
        };
      case 'unstaged':
        return {
          againstIndex: true,
          baseRef: null,
          commitRef: null,
        };
      case 'staged':
      case 'untracked':
      default:
        return {
          againstIndex: false,
          baseRef: null,
          commitRef: null,
        };
    }
  }, [compareBaseRef, compareRef, effectiveGroupKind]);

  const renderHeaderPrefix = useCallback(
    (item: CodeViewItem<DiffListAnnotationMeta>) =>
      renderDiffHeaderPrefix({
        item,
        viewerRef: codeViewRef,
        pathByFileName,
      }),
    [pathByFileName],
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

    const load = async () => {
      setIsLoading(true);
      setError(null);

      try {
        let hasPublishedInitial = false;

        for (let offset = 0; offset < groupFiles.length; offset += CODE_VIEW_BATCH_SIZE) {
          if (cancelled) return;

          const batch = groupFiles.slice(offset, offset + CODE_VIEW_BATCH_SIZE);
          let batchResponse;
          try {
            batchResponse = await gitApi.getFilesDiff(
              repoPath,
              batch.map((file) => file.path),
              null,
              {
                againstIndex: diffRequestOptions.againstIndex,
                baseRef: diffRequestOptions.baseRef,
                commitRef: diffRequestOptions.commitRef,
              },
            );
          } catch (err) {
            for (const file of batch) {
              console.error(`Failed to load diff for ${file.path}:`, err);
            }
            continue;
          }

          const resultByPath = new Map(
            batchResponse.results.map((result) => [result.file_path, result]),
          );
          const codeItems: CodeViewItem<DiffListAnnotationMeta>[] = [];
          for (const file of batch) {
            try {
              const result = resultByPath.get(file.path);
              if (!result?.diff) {
                throw new Error(
                  result?.error ?? `Missing diff result for ${file.path}`,
                );
              }
              const diff = result.diff as GitFileDiffResponse;

              if (isNonTextDiff(diff)) {
                // Keep binary files inside pierre CodeView: non-empty placeholder
                // hunks + BinaryDiffCard annotations. Modified files get two
                // annotations so split layout places Previous left / Current right.
                const { oldText, newText, annotations: binaryAnns } =
                  binaryDiffPlaceholders(diff.status);
                const fileDiff = parseDiffFromFile(
                  {
                    name: file.path,
                    contents: oldText,
                    cacheKey: diffSideCacheKey(
                      file.path,
                      `binary-old:${diff.old_size ?? 0}:${diff.old_sha256 ?? ""}`,
                    ),
                  },
                  {
                    name: file.path,
                    contents: newText,
                    cacheKey: diffSideCacheKey(
                      file.path,
                      `binary-new:${diff.new_size ?? 0}:${diff.new_sha256 ?? ""}`,
                    ),
                  },
                );
                nextPathByFileName.set(fileDiff.name, file.path);
                loadedContentsRef.current.set(file.path, {
                  oldContent: oldText,
                  newContent: newText,
                });
                codeItems.push({
                  id: file.path,
                  type: 'diff',
                  fileDiff,
                  collapsed: collapseModeRef.current === 'collapsed',
                  annotations: binaryAnns.map((ann) => ({
                    side: ann.side,
                    lineNumber: ann.lineNumber,
                    metadata: {
                      kind: 'binary' as const,
                      filePath: file.path,
                      diff,
                      panel: ann.panel,
                    },
                  })),
                } as CodeViewItem<DiffListAnnotationMeta>);
                continue;
              }

              const oldText = diff.old_text ?? "";
              const newText = diff.new_text ?? "";
              const fileDiff = parseDiffFromFile(
                {
                  name: file.path,
                  contents: oldText,
                  cacheKey: diffSideCacheKey(file.path, oldText),
                },
                {
                  name: file.path,
                  contents: newText,
                  cacheKey: diffSideCacheKey(file.path, newText),
                },
              );
              nextPathByFileName.set(fileDiff.name, file.path);
              loadedContentsRef.current.set(file.path, {
                oldContent: oldText,
                newContent: newText,
              });
              codeItems.push({
                id: file.path,
                type: 'diff',
                fileDiff,
                collapsed: collapseModeRef.current === 'collapsed',
              } as CodeViewItem<DiffListAnnotationMeta>);
            } catch (err) {
              console.error(`Failed to load diff for ${file.path}:`, err);
            }
          }

          if (cancelled) return;
          if (codeItems.length === 0) continue;

          setPathByFileName(new Map(nextPathByFileName));

          if (!hasPublishedInitial) {
            hasPublishedInitial = true;
            itemIdsRef.current = codeItems.map((item) => item.id);
            setInitialItems(codeItems);
            setLoadedItemVersion((value) => value + 1);
            setIsLoading(false);
            await yieldToBrowser();
          } else {
            itemIdsRef.current = [
              ...itemIdsRef.current,
              ...codeItems.map((item) => item.id),
            ];
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
          setError(err instanceof Error ? err.message : loadChangesFallbackRef.current);
          setInitialItems([]);
          setIsLoading(false);
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [diffRequestOptions, groupFiles, groupKind, repoPath]);

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
    if (!activeContextId || itemIdsRef.current.length === 0) return;
    if (selectedPath && !hasLoadedAllItems) return;
    if (selectedPath && itemIdsRef.current.includes(selectedPath)) return;
    if (selectedPath && navigationTarget?.diffFilePath === selectedPath) return;
    setDiffGroupActiveFile(groupPath, itemIdsRef.current[0], activeContextId);
  }, [
    activeContextId,
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
        context: { item: CodeViewItem<DiffListAnnotationMeta> },
      ) {
        if (!range || context.item.type !== 'diff') return;
        // Binary placeholder lines are anchors for BinaryDiffCard only.
        if (
          context.item.annotations?.some(
            (a) => a.metadata?.kind === 'binary',
          )
        ) {
          return;
        }
        openCopyAnnotation(context.item.id, range);
      },
      onGutterUtilityClick(
        range: SelectedLineRange,
        context: { item: CodeViewItem<DiffListAnnotationMeta> },
      ) {
        if (context.item.type !== 'diff') return;
        if (
          context.item.annotations?.some(
            (a) => a.metadata?.kind === 'binary',
          )
        ) {
          return;
        }
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
    (handle: CodeViewHandle<DiffListAnnotationMeta> | null) => {
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
    if (instance == null || !activeContextId) return;

    return instance.subscribeToScroll((scrollTop, viewer) => {
      if (itemIdsRef.current.length === 0) return;
      const activeId = findDiffItemIdForViewport(
        viewer,
        itemIdsRef.current,
      );
      if (activeId == null || activeId === scrollActiveIdRef.current) return;
      scrollActiveIdRef.current = activeId;
      setDiffGroupActiveFile(groupPath, activeId, activeContextId);
    });
  }, [activeContextId, groupPath, setDiffGroupActiveFile, viewerMounted, viewerKey]);

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
    if (activeContextId) {
      setDiffGroupActiveFile(groupPath, fileId, activeContextId);
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
        navigationTargetProp === undefined &&
        activeContextId &&
        (navigationTarget.line ||
          navigationTarget.reviewCommentGuid ||
          navigationTarget.reviewMessageGuid)
      ) {
        clearNavigationTarget(groupPath, activeContextId);
      }
    });
  }, [
    navigationTarget,
    navigationTargetProp,
    navigationScrollKey,
    loadedItemVersion,
    isLoading,
    viewerMounted,
    groupPath,
    activeContextId,
    clearNavigationTarget,
    setDiffGroupActiveFile,
  ]);

  if (!groupKind) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        {t('unknownChangesGroup')}
      </div>
    );
  }

  if (isLoading || queriesLoading || !workerPoolReady) {
    return (
      <div className="flex h-full flex-col overflow-hidden bg-background">
        <DiffCodeViewScaffold
          items={treeItems}
          selectedPath={selectedPath}
          ariaLabel={t('fileTreeAria', { label: groupLabel })}
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
          <p className="text-red-500 mb-2">{t('errors.loadChangesTitle')}</p>
          <p className="text-sm text-muted-foreground">{error}</p>
        </div>
      </div>
    );
  }

  if (initialItems.length === 0) {
    return (
      <div className="flex h-full items-center justify-center bg-background text-muted-foreground text-sm">
        {t('noFilesInGroup')}
      </div>
    );
  }

  const handleSelectFile = (path: string) => {
    if (activeContextId) {
      setDiffGroupActiveFile(groupPath, path, activeContextId);
    }
    scrollCodeViewToItem(codeViewRef.current, path, { behavior: 'smooth' });
  };

  const editTargetPath = editingPath ?? selectedPath ?? null;
  const editTargetIsBinary =
    editTargetPath != null &&
    (treeItems.find((file) => file.path === editTargetPath)?.isBinary ?? false);
  const canStartOrToggleEdit =
    canEditWorktree && editTargetPath != null && !editTargetIsBinary;
  const showEditControls = canEditWorktree && editTargetPath != null;
  const showResetButton = Boolean(editingPath && isEditDirty);
  // Clean → Edit icon. Dirty → Save icon + Reset icon peels out to the right.
  const primaryEditLabel = showResetButton ? t('edit.save') : t('edit.edit');
  const primaryEditTitle = showResetButton
    ? t('edit.saveShortcut')
    : primaryEditLabel;

  const toolbar = (
    <div className="flex items-center gap-2">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span className="truncate text-sm font-medium text-foreground">{groupLabel}</span>
        <span className="shrink-0 text-xs text-muted-foreground">
          {t('fileCount', { count: treeItems.length })}
        </span>
        {displayReferenceLabel ? (
          <span className="shrink-0 text-xs text-muted-foreground">
            {displayReferenceLabel}
          </span>
        ) : null}
        {stashedPromptChip}
      </div>
      {(totalStats.additions > 0 || totalStats.deletions > 0) && (
        <div className="flex shrink-0 items-center gap-2 text-[11px] font-mono font-medium">
          <span className="text-emerald-500">+{totalStats.additions}</span>
          <span className="text-red-500">-{totalStats.deletions}</span>
        </div>
      )}
      {showEditControls ? (
        <motion.div
          layout
          className="flex shrink-0 items-center gap-0.5 overflow-hidden"
          transition={{ type: 'spring', stiffness: 420, damping: 32, mass: 0.8 }}
        >
          <motion.button
            type="button"
            layout
            className={cn(
              'relative flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md transition-colors disabled:pointer-events-none disabled:opacity-50',
              showResetButton
                ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                : editingPath
                  ? 'bg-muted text-foreground hover:bg-muted/80'
                  : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
            )}
            disabled={isSavingEdit || (!editingPath && !canStartOrToggleEdit)}
            onClick={handleEditButtonClick}
            title={primaryEditTitle}
            aria-label={primaryEditLabel}
            aria-pressed={editingPath != null && !isEditDirty ? true : undefined}
          >
            <AnimatePresence initial={false} mode="popLayout">
              {isSavingEdit ? (
                <motion.span
                  key="saving"
                  initial={{ opacity: 0, scale: 0.7, rotate: -20 }}
                  animate={{ opacity: 1, scale: 1, rotate: 0 }}
                  exit={{ opacity: 0, scale: 0.7, rotate: 20 }}
                  transition={{ duration: 0.16, ease: 'easeOut' }}
                  className="absolute inset-0 flex items-center justify-center"
                >
                  <Loader2 className="size-3.5 animate-spin" />
                </motion.span>
              ) : showResetButton ? (
                <motion.span
                  key="save"
                  initial={{ opacity: 0, scale: 0.7, y: 4 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.7, y: -4 }}
                  transition={{ duration: 0.16, ease: 'easeOut' }}
                  className="absolute inset-0 flex items-center justify-center"
                >
                  <Save className="size-3.5" />
                </motion.span>
              ) : (
                <motion.span
                  key="edit"
                  initial={{ opacity: 0, scale: 0.7, y: -4 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.7, y: 4 }}
                  transition={{ duration: 0.16, ease: 'easeOut' }}
                  className="absolute inset-0 flex items-center justify-center"
                >
                  <Pencil className="size-3.5" />
                </motion.span>
              )}
            </AnimatePresence>
          </motion.button>
          <AnimatePresence initial={false}>
            {showResetButton ? (
              <motion.div
                key="reset"
                initial={{ width: 0, opacity: 0, scale: 0.85, x: -6 }}
                animate={{ width: 28, opacity: 1, scale: 1, x: 0 }}
                exit={{ width: 0, opacity: 0, scale: 0.85, x: -6 }}
                transition={{ type: 'spring', stiffness: 420, damping: 30, mass: 0.75 }}
                className="overflow-hidden"
              >
                <button
                  type="button"
                  className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
                  disabled={isSavingEdit}
                  onClick={handleResetEdit}
                  title={t('edit.reset')}
                  aria-label={t('edit.reset')}
                >
                  <RotateCcw className="size-3.5" />
                </button>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </motion.div>
      ) : null}
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
        ariaLabel={t('fileTreeAria', { label: groupLabel })}
        toolbar={toolbar}
        defaultTreeVisible={false}
        onSelectFile={handleSelectFile}
      >
        <EditProvider createEditor={createDiffEditor}>
          <CodeView
            key={`${groupPath}:${viewerKey}`}
            ref={handleViewerRef}
            initialItems={initialItems}
            options={codeViewOptions}
            onItemEditChange={canEditWorktree ? handleItemEditChange : undefined}
            renderHeaderPrefix={renderHeaderPrefix}
            renderAnnotation={renderAnnotation}
            className={CODE_VIEW_HOST_CLASS}
          />
        </EditProvider>
      </DiffCodeViewScaffold>
    </div>
  );
}
