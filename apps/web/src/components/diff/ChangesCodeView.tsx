'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CodeView, type CodeViewHandle } from '@pierre/diffs/react';
import type { CodeViewItem, DiffLineAnnotation, SelectedLineRange } from '@pierre/diffs';
import { parseDiffFromFile } from '@pierre/diffs';
import { Loader2 } from 'lucide-react';
import { toastManager } from '@workspace/ui';
import { useTheme } from 'next-themes';
import { gitApi } from '@/api/ws-api';
import { useGitStore } from '@/hooks/use-git-store';
import { useEditorStore } from '@/hooks/use-editor-store';
import { useContextParams } from '@/hooks/use-context-params';
import {
  getDiffGroupKind,
  getDiffGroupTabLabel,
  getFilesForDiffGroup,
  type DiffChangeGroupKind,
} from '@/lib/diff-editor-paths';
import { useDiffWorkerPoolReady } from '@/components/diff/DiffWorkerPoolProvider';
import { DiffCodeViewSettingsMenu } from '@/components/diff/DiffCodeViewSettingsMenu';
import { DiffCopyAnnotation } from '@/components/diff/DiffCopyAnnotation';
import {
  applyCollapseModeToItems,
  getTextForRange,
  isCopyAnnotation,
  type CopyAnnotationMeta,
  updateViewerDiffItem,
} from '@/components/diff/diff-code-view-shared';
import {
  buildSharedDiffViewOptions,
  CODE_VIEW_HOST_CLASS,
} from '@/components/diff/diff-view-constants';
import {
  createDiffHeaderPrefixRenderer,
  findDiffItemIdAtScrollTop,
  scrollCodeViewToItem,
} from '@/components/diff/code-view-ui';

const CODE_VIEW_BATCH_SIZE = 25;

function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, 0));
}

interface ChangesCodeViewProps {
  repoPath: string;
  groupPath: string;
}

export function ChangesCodeView({ repoPath, groupPath }: ChangesCodeViewProps) {
  const groupKind = getDiffGroupKind(groupPath);
  const { effectiveContextId } = useContextParams();
  const { resolvedTheme } = useTheme();
  const compareRef = useGitStore((s) => s.compareRef);
  const stagedFiles = useGitStore((s) => s.stagedFiles);
  const unstagedFiles = useGitStore((s) => s.unstagedFiles);
  const untrackedFiles = useGitStore((s) => s.untrackedFiles);
  const compareFiles = useGitStore((s) => s.compareFiles);

  const clearNavigationTarget = useEditorStore((s) => s.clearNavigationTarget);
  const setDiffGroupActiveFile = useEditorStore((s) => s.setDiffGroupActiveFile);
  const navigationTarget = useEditorStore((s) =>
    effectiveContextId
      ? s.navigationTargets[effectiveContextId]?.[groupPath] ?? null
      : null,
  );

  const workerPoolReady = useDiffWorkerPoolReady();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [initialItems, setInitialItems] = useState<CodeViewItem<CopyAnnotationMeta>[]>(
    [],
  );
  const [viewerKey, setViewerKey] = useState(0);
  const [viewerMounted, setViewerMounted] = useState(false);
  const [diffStyle, setDiffStyle] = useState<'split' | 'unified'>('split');
  const [wordWrap, setWordWrap] = useState(false);
  const [showBackgrounds, setShowBackgrounds] = useState(true);
  const [lineNumbers, setLineNumbers] = useState(true);
  const [diffIndicators, setDiffIndicators] =
    useState<'bars' | 'classic' | 'none'>('bars');
  const [collapseMode, setCollapseMode] = useState<'expanded' | 'collapsed'>(
    'expanded',
  );

  const codeViewRef = useRef<CodeViewHandle<CopyAnnotationMeta>>(null);
  const lastHandledNavRef = useRef<string | null>(null);
  const itemIdsRef = useRef<string[]>([]);
  const pendingAppendRef = useRef<CodeViewItem<CopyAnnotationMeta>[]>([]);
  const scrollActiveIdRef = useRef<string | null>(null);
  const pathByFileNameRef = useRef<Map<string, string>>(new Map());
  const loadedContentsRef = useRef<
    Map<string, { oldContent: string; newContent: string }>
  >(new Map());
  const copyKeyRef = useRef(0);

  const groupFiles = useMemo(() => {
    if (!groupKind) return [];
    return getFilesForDiffGroup(groupKind, {
      stagedFiles,
      unstagedFiles,
      untrackedFiles,
      compareFiles,
      compareRef,
    });
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

  const renderHeaderPrefix = useMemo(
    () =>
      createDiffHeaderPrefixRenderer({
        viewerRef: codeViewRef,
        pathByFileName: pathByFileNameRef.current,
      }),
    [viewerMounted, viewerKey],
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

  const handleCopyAnnotation = useCallback(
    (itemId: string, key: string) => {
      const viewer = codeViewRef.current;
      const item = viewer?.getItem(itemId);
      const contents = loadedContentsRef.current.get(itemId);
      if (item?.type !== 'diff' || !contents) return;

      const annotation = item.annotations?.find(
        (a) => isCopyAnnotation(a) && a.metadata.key === key,
      );
      if (!annotation || !isCopyAnnotation(annotation)) return;

      const text = getTextForRange(contents, annotation.metadata.range);
      if (!text) {
        toastManager.add({
          title: 'Nothing to copy',
          type: 'error',
        });
        return;
      }

      void navigator.clipboard.writeText(text).then(
        () =>
          toastManager.add({
            title: 'Copied to clipboard',
            type: 'success',
          }),
        () =>
          toastManager.add({
            title: 'Failed to copy',
            type: 'error',
          }),
      );
      removeCopyAnnotation(itemId, key);
    },
    [removeCopyAnnotation],
  );

  const openCopyAnnotation = useCallback(
    (itemId: string, range: SelectedLineRange) => {
      const viewer = codeViewRef.current;
      if (viewer == null) return;

      const side = range.endSide ?? range.side;
      if (!side) return;

      const lineNumber = range.end;
      const key = `copy-${copyKeyRef.current++}`;

      updateViewerDiffItem(viewer, itemId, (item) => {
        const withoutCopy = (item.annotations ?? []).filter(
          (a) => !isCopyAnnotation(a),
        );
        const nextAnnotation: DiffLineAnnotation<CopyAnnotationMeta> = {
          side,
          lineNumber,
          metadata: { kind: 'copy', key, filePath: itemId, range },
        };
        item.annotations = [...withoutCopy, nextAnnotation];
        return true;
      });
    },
    [],
  );

  const renderAnnotation = useCallback(
    (annotation: DiffLineAnnotation<CopyAnnotationMeta>) => {
      if (!isCopyAnnotation(annotation)) return null;
      return (
        <DiffCopyAnnotation
          annotation={annotation}
          itemId={annotation.metadata.filePath}
          onCopy={handleCopyAnnotation}
          onDismiss={removeCopyAnnotation}
        />
      );
    },
    [handleCopyAnnotation, removeCopyAnnotation],
  );

  useEffect(() => {
    if (!groupKind) {
      setInitialItems([]);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setViewerKey((key) => key + 1);
    setViewerMounted(false);
    setInitialItems([]);
    pendingAppendRef.current = [];
    pathByFileNameRef.current = new Map();
    loadedContentsRef.current = new Map();
    lastHandledNavRef.current = null;

    const loadFile = async (file: (typeof groupFiles)[number]) => {
      const diff = await gitApi.getFileDiff(repoPath, file.path);
      const fileDiff = parseDiffFromFile(
        { name: file.path, contents: diff.old_content },
        { name: file.path, contents: diff.new_content },
      );
      pathByFileNameRef.current.set(fileDiff.name, file.path);
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
            });
          }

          if (codeItems.length === 0) continue;

          if (!hasPublishedInitial) {
            hasPublishedInitial = true;
            itemIdsRef.current = codeItems.map((item) => item.id);
            setInitialItems(codeItems);
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
    const pending = pendingAppendRef.current;
    pendingAppendRef.current = [];
    codeViewRef.current?.addItems(pending);
  }, [viewerMounted, initialItems]);

  const codeViewOptions = useMemo(
    () => ({
      ...buildSharedDiffViewOptions({
        theme: resolvedTheme === 'dark' ? 'pierre-dark' : 'pierre-light',
        diffStyle,
        wordWrap,
        disableBackground: !showBackgrounds,
        lineNumbers,
        diffIndicators,
        enableLineSelection: false,
        enableGutterUtility: true,
      }),
      onGutterUtilityClick(
        range: SelectedLineRange,
        context: { item: CodeViewItem<CopyAnnotationMeta> },
      ) {
        if (context.item.type !== 'diff') return;
        openCopyAnnotation(context.item.id, range);
      },
    }),
    [
      resolvedTheme,
      diffStyle,
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
      const activeId = findDiffItemIdAtScrollTop(
        viewer,
        scrollTop,
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
    if (lastHandledNavRef.current === navigationScrollKey) return;
    lastHandledNavRef.current = navigationScrollKey;

    const fileId = navigationTarget.diffFilePath;
    if (effectiveContextId) {
      setDiffGroupActiveFile(groupPath, fileId, effectiveContextId);
    }

    requestAnimationFrame(() => {
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
      <div className="flex h-full items-center justify-center bg-background">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
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

  const groupLabel = getDiffGroupTabLabel(groupPath);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-sidebar-border bg-muted/30 px-4">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span className="truncate text-sm font-medium text-foreground">{groupLabel}</span>
          <span className="text-xs text-muted-foreground shrink-0">
            {initialItems.length} file{initialItems.length === 1 ? '' : 's'}
          </span>
          {compareRef ? (
            <span className="text-xs text-muted-foreground shrink-0">vs {compareRef}</span>
          ) : null}
          {(totalStats.additions > 0 || totalStats.deletions > 0) && (
            <span className="shrink-0 font-mono text-xs">
              {totalStats.additions > 0 && (
                <span className="text-green-500">+{totalStats.additions}</span>
              )}
              {totalStats.additions > 0 && totalStats.deletions > 0 && (
                <span className="mx-1 text-muted-foreground">/</span>
              )}
              {totalStats.deletions > 0 && (
                <span className="text-red-500">-{totalStats.deletions}</span>
              )}
            </span>
          )}
        </div>
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

      <div className="relative flex min-h-0 flex-1 flex-col">
        <CodeView
          key={`${groupPath}:${viewerKey}`}
          ref={handleViewerRef}
          initialItems={initialItems}
          options={codeViewOptions}
          renderHeaderPrefix={renderHeaderPrefix}
          renderAnnotation={renderAnnotation}
          className={CODE_VIEW_HOST_CLASS}
        />
      </div>
    </div>
  );
}
