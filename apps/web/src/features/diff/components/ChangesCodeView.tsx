'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CodeView, type CodeViewHandle } from '@pierre/diffs/react';
import type { CodeViewItem, SelectedLineRange } from '@pierre/diffs';
import { parseDiffFromFile } from '@pierre/diffs';
import { useTranslations } from 'next-intl';
import { useTheme } from 'next-themes';
import { Loader2 } from 'lucide-react';
import { gitApi } from '@/api/ws-api';
import { useGitStore } from '@/features/git/store/use-git-store';
import { useEditorStore, type FileNavigationTarget } from '@/features/editor/store/use-editor-store';
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
import {
  useDiffPromptStash,
  type LoadedDiffContents,
} from '@/features/diff/components/useDiffPromptStash';
import type { AgentFixContextRef } from '@/features/agent-fix/types';
import { sortByDiffTreePath } from '@/features/diff/lib/diff-file-order';
import {
  applyCollapseModeToItems,
  type CopyAnnotationMeta,
} from '@/features/diff/lib/diff-code-view-shared';
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

const CODE_VIEW_BATCH_SIZE = 25;

function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, 0));
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
  const { resolvedTheme } = useTheme();
  const groupKind = getDiffGroupKind(groupPath);
  const { effectiveContextId } = useContextParams();
  const activeContextId = contextId ?? effectiveContextId;
  const compareRef = useGitStore((s) => s.compareRef);
  const stagedFiles = useGitStore((s) => s.stagedFiles);
  const unstagedFiles = useGitStore((s) => s.unstagedFiles);
  const untrackedFiles = useGitStore((s) => s.untrackedFiles);
  const compareFiles = useGitStore((s) => s.compareFiles);

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
  const [initialItems, setInitialItems] = useState<CodeViewItem<CopyAnnotationMeta>[]>(
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

  const codeViewRef = useRef<CodeViewHandle<CopyAnnotationMeta>>(null);
  const lastHandledNavRef = useRef<string | null>(null);
  const itemIdsRef = useRef<string[]>([]);
  const pendingAppendRef = useRef<CodeViewItem<CopyAnnotationMeta>[]>([]);
  const scrollActiveIdRef = useRef<string | null>(null);
  const loadedContentsRef = useRef<Map<string, LoadedDiffContents>>(new Map());
  const collapseModeRef = useRef(collapseMode);
  const { openCopyAnnotation, renderAnnotation, stashedPromptChip } =
    useDiffPromptStash({
      agentFixContext,
      scope: stashedPromptScope,
      viewerRef: codeViewRef,
      loadedContentsRef,
    });

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
    (item: CodeViewItem<CopyAnnotationMeta>) =>
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
          setError(err instanceof Error ? err.message : t('errors.loadChangesFallback'));
          setInitialItems([]);
          setIsLoading(false);
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [groupFiles, groupKind, repoPath, t]);

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

  if (isLoading || !workerPoolReady) {
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
  const toolbar = (
    <div className="flex items-center gap-2">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span className="truncate text-sm font-medium text-foreground">{groupLabel}</span>
        <span className="shrink-0 text-xs text-muted-foreground">
          {t('fileCount', { count: treeItems.length })}
        </span>
        {compareRef ? (
          <span className="shrink-0 text-xs text-muted-foreground">
            {t('compareRef', { compareRef })}
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
