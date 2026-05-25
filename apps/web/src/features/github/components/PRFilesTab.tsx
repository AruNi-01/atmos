"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CodeView, type CodeViewHandle } from '@pierre/diffs/react';
import type { CodeViewItem, DiffLineAnnotation } from '@pierre/diffs';
import { processFile } from '@pierre/diffs';
import { useTheme } from 'next-themes';
import { Avatar, AvatarImage, AvatarFallback, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@workspace/ui';
import { MessageSquare } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { MarkdownRenderer } from '@/shared/components/markdown/MarkdownRenderer';
import { DiffCodeViewScaffold } from '@/features/diff/components/DiffCodeViewScaffold';
import { sortByDiffTreePath } from '@/features/diff/lib/diff-file-order';
import type { PrFile } from '@/features/github/hooks/use-github';
import { useDiffWorkerPoolReady } from '@/features/diff/components/DiffWorkerPoolProvider';
import { DiffCodeViewSettingsMenu } from '@/features/diff/components/DiffCodeViewSettingsMenu';
import { applyCollapseModeToItems } from '@/features/diff/lib/diff-code-view-shared';
import { ATMOS_DIFF_THEME, buildSharedDiffViewOptions, CODE_VIEW_HOST_CLASS, getAtmosDiffThemeType } from '@/features/diff/lib/diff-view-constants';
import { useDiffSettingsStore } from '@/features/settings/store/diff-settings-store';
import {
  createDiffHeaderPrefixRenderer,
  findDiffItemIdAtScrollTop,
  scrollCodeViewToItem,
} from '@/features/diff/lib/code-view-ui';

interface ReviewComment {
  id?: number;
  body?: string;
  path?: string;
  line?: number | null;
  original_line?: number | null;
  side?: string;
  user?: { login?: string; avatar_url?: string };
  created_at?: string;
  in_reply_to_id?: number;
}

interface PRFilesTabProps {
  files: PrFile[];
  loading: boolean;
  reviewComments?: ReviewComment[];
  owner: string;
  repo: string;
}

function groupCommentsByPath(comments: ReviewComment[]): Map<string, ReviewComment[][]> {
  const threadMap = new Map<number, ReviewComment[]>();
  for (const c of comments) {
    const rootId = c.in_reply_to_id ?? c.id ?? 0;
    if (!threadMap.has(rootId)) threadMap.set(rootId, []);
    threadMap.get(rootId)!.push(c);
  }
  const byPath = new Map<string, ReviewComment[][]>();
  for (const thread of threadMap.values()) {
    const path = thread[0]?.path ?? '';
    if (!byPath.has(path)) byPath.set(path, []);
    byPath.get(path)!.push(thread);
  }
  return byPath;
}

function FileCommentThread({ thread }: { thread: ReviewComment[] }) {
  const first = thread[0];
  const [collapsed, setCollapsed] = React.useState(false);
  return (
    <div
      className="border border-border/50 rounded-lg overflow-hidden bg-background my-1 mx-2 text-[12px] block"
      style={{ contain: 'layout inline-size', containerType: 'inline-size', minWidth: 0, maxWidth: '100%' }}
    >
      <button
        className="bg-muted/30 px-3 py-1.5 border-b border-border/30 text-[10px] text-muted-foreground flex items-center gap-1.5 w-full text-left group cursor-pointer"
        onClick={() => setCollapsed((v) => !v)}
      >
        <MessageSquare className="size-3 shrink-0" />
        {first?.line != null ? `Line ${first.line}` : 'Comment'}
      </button>
      {!collapsed && (
        <div className="overflow-x-hidden">
          {thread.map((c, i) => (
            <div key={c.id ?? i} className="px-3 py-2 border-b border-border/50 last:border-0 min-w-0 overflow-hidden">
              <div className="flex items-center gap-2 mb-1">
                <Avatar className="size-4 border border-border/50 shrink-0">
                  <AvatarImage src={c.user?.avatar_url ?? `https://github.com/${c.user?.login}.png?size=32`} />
                  <AvatarFallback className="text-[6px]">{c.user?.login?.substring(0, 2).toUpperCase()}</AvatarFallback>
                </Avatar>
                <span className="font-semibold text-foreground/90 truncate">{c.user?.login}</span>
                {c.created_at && (
                  <span className="text-[10px] text-muted-foreground/60 ml-auto shrink-0">
                    {formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}
                  </span>
                )}
              </div>
              <div className="min-w-0 max-w-full overflow-x-auto overflow-y-hidden">
                <MarkdownRenderer className="prose prose-sm dark:prose-invert max-w-none text-[12px] leading-relaxed [&_pre]:overflow-x-auto prose-p:my-0 prose-ul:my-1 prose-ol:my-1 prose-li:my-0 prose-headings:my-1">
                  {c.body ?? ''}
                </MarkdownRenderer>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

type PrAnnotationMeta = {
  kind: 'line-thread';
  threadIndex: number;
  path: string;
};

export function PRFilesTab({ files, loading, reviewComments = [], owner, repo }: PRFilesTabProps) {
  const { resolvedTheme } = useTheme();
  const workerPoolReady = useDiffWorkerPoolReady();
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
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
  const pathByFileNameRef = useRef<Map<string, string>>(new Map());
  const codeViewRef = useRef<CodeViewHandle<PrAnnotationMeta | undefined>>(null);
  const itemIdsRef = useRef<string[]>([]);
  const scrollActiveIdRef = useRef<string | null>(null);

  useEffect(() => {
    void loadDiffSettings();
  }, [loadDiffSettings]);

  const codeViewMountKey = useMemo(
    () => files.map((f) => f.filename).join('|'),
    [files],
  );

  const orderedFiles = useMemo(
    () => sortByDiffTreePath(files.map((file) => ({ path: file.filename, file }))).map((entry) => entry.file),
    [files],
  );
  const commentsByPath = useMemo(
    () => groupCommentsByPath(reviewComments),
    [reviewComments],
  );
  const treeItems = useMemo(
    () =>
      orderedFiles
        .filter((file) => Boolean(file.patch))
        .map((file) => ({
          path: file.filename,
          additions: file.additions,
          deletions: file.deletions,
        })),
    [orderedFiles],
  );

  const { codeViewItems, fileLevelThreads, pathByFileName, itemIds } = useMemo(() => {
    const items: CodeViewItem<PrAnnotationMeta>[] = [];
    const fileThreads = new Map<string, ReviewComment[][]>();
    const nextPathByFileName = new Map<string, string>();

    for (const file of orderedFiles) {
      const threads = commentsByPath.get(file.filename) ?? [];
      const lineThreads = threads.filter(
        (t) => t[0]?.line != null || t[0]?.original_line != null,
      );
      const nonLineThreads = threads.filter(
        (t) => t[0]?.line == null && t[0]?.original_line == null,
      );
      if (nonLineThreads.length > 0) {
        fileThreads.set(file.filename, nonLineThreads);
      }

      if (!file.patch) continue;

      const patch = `--- a/${file.filename}\n+++ b/${file.filename}\n${file.patch}`;
      const fileDiff = processFile(patch, { cacheKey: file.filename });
      if (!fileDiff) continue;

      const annotations: DiffLineAnnotation<PrAnnotationMeta>[] = lineThreads.map(
        (thread, threadIndex) => {
          const first = thread[0];
          const lineNumber = first?.line ?? first?.original_line ?? 1;
          const side = first?.side === 'LEFT' ? 'deletions' : 'additions';
          return {
            side: side as 'deletions' | 'additions',
            lineNumber,
            metadata: {
              kind: 'line-thread' as const,
              threadIndex,
              path: file.filename,
            },
          };
        },
      );

      nextPathByFileName.set(fileDiff.name, file.filename);
      items.push({
        id: file.filename,
        type: 'diff',
        fileDiff,
        annotations,
      });
    }

    return {
      codeViewItems: items,
      fileLevelThreads: fileThreads,
      pathByFileName: nextPathByFileName,
      itemIds: items.map((item) => item.id),
    };
  }, [orderedFiles, commentsByPath]);

  const renderHeaderPrefix = useMemo(
    () =>
      createDiffHeaderPrefixRenderer({
        viewerRef: codeViewRef,
        pathByFileName,
      }),
    [codeViewMountKey, pathByFileName, viewerMounted],
  );

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
        enableLineSelection: false,
      }),
    }),
    [diffStyle, wordWrap, showBackgrounds, lineNumbers, diffIndicators, resolvedTheme],
  );

  const handleToggleCollapseMode = useCallback(() => {
    const next = collapseMode === 'expanded' ? 'collapsed' : 'expanded';
    setCollapseMode(next);
    applyCollapseModeToItems(codeViewRef, itemIdsRef.current, next);
  }, [collapseMode]);

  const renderAnnotation = useCallback(
    (annotation: DiffLineAnnotation<PrAnnotationMeta>) => {
      if (annotation.metadata?.kind !== 'line-thread') return null;
      const threads = commentsByPath.get(annotation.metadata.path) ?? [];
      const lineThreads = threads.filter(
        (t) => t[0]?.line != null || t[0]?.original_line != null,
      );
      const thread = lineThreads[annotation.metadata.threadIndex];
      if (!thread) return null;
      return <FileCommentThread thread={thread} />;
    },
    [commentsByPath],
  );

  useEffect(() => {
    pathByFileNameRef.current = pathByFileName;
    itemIdsRef.current = itemIds;
  }, [itemIds, pathByFileName]);

  useEffect(() => {
    if (codeViewItems.length === 0) {
      setSelectedPath(null);
      return;
    }
    setSelectedPath((current) =>
      current && codeViewItems.some((item) => item.id === current)
        ? current
        : codeViewItems[0]?.id ?? null,
    );
  }, [codeViewItems]);

  const handleViewerRef = useCallback(
    (handle: CodeViewHandle<PrAnnotationMeta | undefined> | null) => {
      codeViewRef.current = handle;
      setViewerMounted(handle != null);
    },
    [],
  );

  useEffect(() => {
    const instance = codeViewRef.current?.getInstance();
    if (instance == null) return;

    return instance.subscribeToScroll((scrollTop, viewer) => {
      if (itemIdsRef.current.length === 0) return;
      const activeId = findDiffItemIdAtScrollTop(
        viewer,
        scrollTop,
        itemIdsRef.current,
      );
      if (activeId == null || activeId === scrollActiveIdRef.current) return;
      scrollActiveIdRef.current = activeId;
      setSelectedPath(activeId);
    });
  }, [codeViewMountKey, viewerMounted]);

  const totalStats = useMemo(
    () => ({
      additions: orderedFiles.reduce((s, f) => s + f.additions, 0),
      deletions: orderedFiles.reduce((s, f) => s + f.deletions, 0),
      changed: orderedFiles.length,
    }),
    [orderedFiles],
  );

  const handleSelect = (path: string) => {
    setSelectedPath(path);
    scrollCodeViewToItem(codeViewRef.current, path, { behavior: 'smooth' });
  };

  const toolbar = (
    <div className="flex items-center gap-2">
      <div className="flex-1" />
      {orderedFiles.length > 0 && (
        <div className="flex items-center gap-2 shrink-0 text-[11px] font-mono font-medium">
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

  if (loading) {
    return (
      <div className="flex flex-col h-full min-h-0">
        <DiffCodeViewScaffold
          items={treeItems}
          selectedPath={selectedPath ?? undefined}
          ariaLabel="PR changed files"
          toolbar={toolbar}
          loading
          loadingTreeLabel="Files"
          onSelectFile={() => {}}
        >
          <div />
        </DiffCodeViewScaffold>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <DiffCodeViewScaffold
        items={treeItems}
        selectedPath={selectedPath ?? undefined}
        ariaLabel="PR changed files"
        toolbar={toolbar}
        renderFileInlineDecoration={(item) => {
          const count = commentsByPath.get(item.path)?.length ?? 0;
          if (!count) return null;
          return (
            <span className="ml-1 flex items-center gap-0.5 text-[11px] text-muted-foreground shrink-0">
              <MessageSquare className="size-3" />
              {count}
            </span>
          );
        }}
        onSelectFile={handleSelect}
      >
          {workerPoolReady && codeViewItems.length > 0 ? (
          <CodeView
            key={codeViewMountKey}
            ref={handleViewerRef}
            initialItems={codeViewItems}
            options={codeViewOptions}
            renderAnnotation={renderAnnotation}
            renderHeaderPrefix={renderHeaderPrefix}
            className={CODE_VIEW_HOST_CLASS}
          />
          ) : !loading ? (
            <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
              No diff content
            </div>
          ) : null}
          {Array.from(fileLevelThreads.entries()).map(([path, threads]) => (
            <div key={path} className="border-t border-border/30 px-2 py-1">
              <div className="text-[10px] text-muted-foreground px-2 py-1 font-mono truncate">{path}</div>
              {threads.map((thread, i) => (
                <FileCommentThread key={i} thread={thread} />
              ))}
            </div>
          ))}
      </DiffCodeViewScaffold>
    </div>
  );
}
