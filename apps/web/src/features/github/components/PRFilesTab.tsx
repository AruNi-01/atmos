"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CodeView, type CodeViewHandle } from '@pierre/diffs/react';
import type { CodeViewItem, DiffLineAnnotation } from '@pierre/diffs';
import { processFile } from '@pierre/diffs';
import { useLocale, useTranslations } from 'next-intl';
import { useTheme } from 'next-themes';
import { Avatar, AvatarImage, AvatarFallback } from '@workspace/ui';
import { MessageSquare } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { enUS, zhCN } from 'date-fns/locale';
import { MarkdownRenderer } from '@/shared/components/markdown/MarkdownRenderer';
import { DiffCodeViewScaffold } from '@/features/diff/components/DiffCodeViewScaffold';
import { BinaryDiffCard } from '@/features/diff/components/BinaryDiffCard';
import { sortByDiffTreePath } from '@/features/diff/lib/diff-file-order';
import type { PrFile } from '@/features/github/hooks/use-github';
import type { GitFileDiffResponse } from '@/api/ws-api-types';
import { useDiffWorkerPoolReady } from '@/features/diff/components/DiffWorkerPoolProvider';
import { DiffCodeViewSettingsMenu } from '@/features/diff/components/DiffCodeViewSettingsMenu';
import { applyCollapseModeToItems } from '@/features/diff/lib/diff-code-view-shared';
import { ATMOS_DIFF_THEME, buildSharedDiffViewOptions, CODE_VIEW_HOST_CLASS, getAtmosDiffThemeType } from '@/features/diff/lib/diff-view-constants';
import { useDiffSettingsStore } from '@/features/settings/store/diff-settings-store';
import {
  findDiffItemIdAtScrollTop,
  renderDiffHeaderPrefix,
  scrollCodeViewToItem,
} from '@/features/diff/lib/code-view-ui';
import { AgentFixButton } from '@/features/agent-fix/components/AgentFixButton';
import type { AgentFixContextRef, AgentFixPromptSource } from '@/features/agent-fix/types';
import { buildPrReviewThreadFixPrompt } from '@/features/github/lib/agent-fix-prompts';
import { cn } from '@/shared/lib/utils';

interface ReviewComment {
  id?: number;
  body?: string;
  path?: string;
  line?: number | null;
  original_line?: number | null;
  side?: string;
  diff_hunk?: string;
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
  prNumber?: number | null;
  title?: string | null;
  headRefName?: string | null;
  baseRefName?: string | null;
  url?: string | null;
  agentFixContext?: AgentFixContextRef | null;
  onCodeViewTopBoundaryWheel?: (deltaY: number) => void;
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

function FileCommentThread({
  agentFixSource,
  thread,
}: {
  agentFixSource?: AgentFixPromptSource;
  thread: ReviewComment[];
}) {
  const locale = useLocale();
  const t = useTranslations('github.prFilesTab');
  const relativeTimeLocale = locale.startsWith('zh') ? zhCN : enUS;
  const first = thread[0];
  const firstLine = first?.line ?? first?.original_line ?? null;
  const firstLogin = first?.user?.login?.trim();
  const firstAvatarUrl =
    first?.user?.avatar_url ??
    (firstLogin
      ? `https://github.com/${firstLogin.replace('[bot]', '')}.png?size=32`
      : undefined);
  const [collapsed, setCollapsed] = React.useState(false);
  const [agentFixSettingsOpen, setAgentFixSettingsOpen] = React.useState(false);
  return (
    <div
      className="border border-border/50 rounded-lg overflow-hidden bg-background my-1 mx-2 text-[12px] block"
      style={{ contain: 'layout inline-size', containerType: 'inline-size', minWidth: 0, maxWidth: '100%' }}
    >
      <div
        role="button"
        tabIndex={0}
        aria-expanded={!collapsed}
        className="group/file-thread bg-muted/30 px-3 py-1.5 border-b border-border/30 text-[10px] text-muted-foreground flex min-w-0 items-center gap-1.5 w-full text-left cursor-pointer transition-colors duration-180 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-muted/50"
        onClick={() => setCollapsed((v) => !v)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            setCollapsed((value) => !value);
          }
        }}
      >
        {firstLogin && (
          <>
            <Avatar className="size-4 border border-border/50 shrink-0">
              <AvatarImage src={firstAvatarUrl} />
              <AvatarFallback className="text-[6px]">
                {firstLogin.substring(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <span className="min-w-0 truncate text-[11px] font-semibold text-foreground/90">
              {firstLogin}
            </span>
          </>
        )}
        <span
          className={cn(
            "relative ml-auto flex h-6 shrink-0 items-center justify-end",
            agentFixSource ? "w-[126px]" : "w-auto",
          )}
        >
          <span
            className={cn(
              agentFixSource &&
                "group-hover/file-thread:opacity-0 group-focus-visible/file-thread:opacity-0",
              agentFixSettingsOpen && "opacity-0",
            )}
          >
            {firstLine != null ? t('thread.lineLabel', { line: firstLine }) : t('thread.commentLabel')}
          </span>
          {agentFixSource ? (
            <span
              className={cn(
                "invisible pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 opacity-0",
                "group-hover/file-thread:visible group-hover/file-thread:pointer-events-auto group-hover/file-thread:opacity-100",
                "group-focus-visible/file-thread:visible group-focus-visible/file-thread:pointer-events-auto group-focus-visible/file-thread:opacity-100",
                agentFixSettingsOpen && "visible pointer-events-auto opacity-100",
              )}
              onClick={(event) => event.stopPropagation()}
              onKeyDown={(event) => event.stopPropagation()}
            >
              <AgentFixButton
                source={agentFixSource}
                mode="label"
                appearance="subtle"
                onSettingsOpenChange={setAgentFixSettingsOpen}
              />
            </span>
          ) : null}
        </span>
      </div>
      {!collapsed && (
        <div className="overflow-x-hidden">
          {thread.map((c, i) => (
            <div key={c.id ?? i} className="px-3 py-2 border-b border-border/50 last:border-0 min-w-0 overflow-hidden">
              {i > 0 && (
                <div className="flex items-center gap-2 mb-1">
                  <Avatar className="size-4 border border-border/50 shrink-0">
                    <AvatarImage src={c.user?.avatar_url ?? `https://github.com/${c.user?.login}.png?size=32`} />
                      <AvatarFallback className="text-[6px]">{c.user?.login?.substring(0, 2).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <span className="font-semibold text-foreground/90 truncate">{c.user?.login}</span>
                  {c.created_at && (
                    <span className="text-[10px] text-muted-foreground/60 ml-auto shrink-0">
                      {formatDistanceToNow(new Date(c.created_at), {
                        addSuffix: true,
                        locale: relativeTimeLocale,
                      })}
                    </span>
                  )}
                </div>
              )}
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

export function PRFilesTab({
  agentFixContext = null,
  baseRefName,
  files,
  headRefName,
  loading,
  onCodeViewTopBoundaryWheel,
  owner,
  prNumber,
  repo,
  reviewComments = [],
  title,
  url,
}: PRFilesTabProps) {
  const t = useTranslations('github.prFilesTab');
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
  const codeViewScrollTopRef = useRef(0);
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
  const buildFileThreadAgentFixSource = useCallback(
    (thread: ReviewComment[]): AgentFixPromptSource | undefined => {
      if (!prNumber) return undefined;
      const first = thread[0];
      const path = first?.path || '';
      if (!path) return undefined;
      const line = first?.line ?? first?.original_line ?? null;
      const fileName = path.split('/').filter(Boolean).pop() || path;
      return {
        id: `pr-review-file:${owner}/${repo}#${prNumber}:${path}:${line ?? 'line'}:${first?.id ?? 'thread'}`,
        family: 'pr_review',
        context: agentFixContext,
        label: t('agentFix.label', { fileName }),
        disabledReason: agentFixContext ? null : t('agentFix.disabledReason'),
        getPrompt: () => ({
          prompt: buildPrReviewThreadFixPrompt(
            {
              owner,
              repo,
              prNumber,
              title,
              headRefName,
              baseRefName,
              url,
            },
            {
              path,
              line,
              diffHunk: first?.diff_hunk || '',
              comments: thread,
            },
          ),
          terminalTabTitle: t('agentFix.terminalTabTitle', { prNumber }),
          terminalPaneLabel: t('agentFix.terminalPaneLabel', { fileName }),
        }),
      };
    },
    [agentFixContext, baseRefName, headRefName, owner, prNumber, repo, t, title, url],
  );
  const treeItems = useMemo(
    () =>
      orderedFiles.map((file) => ({
        path: file.filename,
        additions: file.additions,
        deletions: file.deletions,
        isBinary: file.kind === 'binary' || (!file.patch && file.kind !== 'text'),
      })),
    [orderedFiles],
  );

  const { codeViewItems, fileLevelThreads, pathByFileName, itemIds, binaryFiles } =
    useMemo(() => {
    const items: CodeViewItem<PrAnnotationMeta>[] = [];
    const binary: PrFile[] = [];
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

      if (!file.patch || file.kind === 'binary' || file.kind === 'too_large') {
        binary.push(file);
        continue;
      }

      const patch = `--- a/${file.filename}\n+++ b/${file.filename}\n${file.patch}`;
      const fileDiff = processFile(patch, { cacheKey: file.filename });
      if (!fileDiff) {
        binary.push(file);
        continue;
      }

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
        cacheKey: file.filename,
      } as CodeViewItem<PrAnnotationMeta> & { cacheKey: string });
    }

    return {
      codeViewItems: items,
      binaryFiles: binary,
      fileLevelThreads: fileThreads,
      pathByFileName: nextPathByFileName,
      itemIds: items.map((item) => item.id),
    };
  }, [orderedFiles, commentsByPath]);

  const renderHeaderPrefix = useCallback(
    (item: CodeViewItem<PrAnnotationMeta | undefined>) =>
      renderDiffHeaderPrefix({
        item,
        viewerRef: codeViewRef,
        pathByFileName,
      }),
    [pathByFileName],
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
      return (
        <FileCommentThread
          thread={thread}
          agentFixSource={buildFileThreadAgentFixSource(thread)}
        />
      );
    },
    [buildFileThreadAgentFixSource, commentsByPath],
  );

  useEffect(() => {
    pathByFileNameRef.current = pathByFileName;
    itemIdsRef.current = itemIds;
  }, [itemIds, pathByFileName]);

  const selectedCodeViewPath = useMemo(() => {
    if (selectedPath && codeViewItems.some((item) => item.id === selectedPath)) {
      return selectedPath;
    }
    return codeViewItems[0]?.id ?? null;
  }, [codeViewItems, selectedPath]);

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
    codeViewScrollTopRef.current = instance.getScrollTop();

    return instance.subscribeToScroll((scrollTop, viewer) => {
      codeViewScrollTopRef.current = scrollTop;
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

  const handleCodeViewWheelCapture = useCallback(
    (event: React.WheelEvent<HTMLDivElement>) => {
      const currentScrollTop =
        codeViewRef.current?.getInstance()?.getScrollTop() ??
        codeViewScrollTopRef.current;
      if (event.deltaY >= -8 || currentScrollTop > 1) return;
      onCodeViewTopBoundaryWheel?.(event.deltaY);
      event.preventDefault();
      event.stopPropagation();
    },
    [onCodeViewTopBoundaryWheel],
  );

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
          selectedPath={selectedCodeViewPath ?? undefined}
          ariaLabel={t('tree.ariaLabel')}
          toolbar={toolbar}
          loading
          loadingTreeLabel={t('tree.loadingLabel')}
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
        selectedPath={selectedCodeViewPath ?? undefined}
        ariaLabel={t('tree.ariaLabel')}
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
          {workerPoolReady && (codeViewItems.length > 0 || binaryFiles.length > 0) ? (
          <div
            className="min-h-0 flex-1 overflow-auto"
            onWheelCapture={handleCodeViewWheelCapture}
          >
            {codeViewItems.length > 0 ? (
              <CodeView
                key={codeViewMountKey}
                ref={handleViewerRef}
                initialItems={codeViewItems}
                options={codeViewOptions}
                renderAnnotation={renderAnnotation}
                renderHeaderPrefix={renderHeaderPrefix}
                className={CODE_VIEW_HOST_CLASS}
              />
            ) : null}
            {binaryFiles.length > 0 ? (
              <div className="flex flex-col gap-2 px-1 py-2">
                {binaryFiles.map((file) => {
                  const status =
                    file.status === 'added'
                      ? 'A'
                      : file.status === 'removed'
                        ? 'D'
                        : file.status === 'renamed'
                          ? 'R'
                          : 'M';
                  const synthetic: GitFileDiffResponse = {
                    file_path: file.filename,
                    status,
                    compare_ref: null,
                    kind: file.kind === 'too_large' ? 'too_large' : 'binary',
                    preview_kind: file.preview_kind ?? 'none',
                    old_text: null,
                    new_text: null,
                    old_size: null,
                    new_size: null,
                    old_sha256: null,
                    new_sha256: null,
                    old_blob: null,
                    new_blob: null,
                  };
                  return (
                    <BinaryDiffCard
                      key={file.filename}
                      compact
                      diff={synthetic}
                      repoPath=""
                    />
                  );
                })}
              </div>
            ) : null}
          </div>
          ) : !loading ? (
            <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
              {t('empty.noDiffContent')}
            </div>
          ) : null}
          {Array.from(fileLevelThreads.entries()).map(([path, threads]) => (
            <div key={path} className="border-t border-border/30 px-2 py-1">
              <div className="text-[10px] text-muted-foreground px-2 py-1 font-mono truncate">{path}</div>
              {threads.map((thread, i) => (
                <FileCommentThread
                  key={i}
                  thread={thread}
                  agentFixSource={buildFileThreadAgentFixSource(thread)}
                />
              ))}
            </div>
          ))}
      </DiffCodeViewScaffold>
    </div>
  );
}
