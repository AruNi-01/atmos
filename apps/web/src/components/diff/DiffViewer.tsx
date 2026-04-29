'use client';

import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { FileDiff } from '@pierre/diffs/react';
import type {
  DiffLineAnnotation,
  FileContents,
  FileDiffOptions,
  SelectedLineRange,
  ChangeContent,
  FileDiffMetadata,
} from '@pierre/diffs';
import { parseDiffFromFile } from '@pierre/diffs';
import { gitApi, reviewWsApi } from '@/api/ws-api';
import type { ReviewThreadDto } from '@/api/ws-api';
import { Button, Loader2, Textarea, toastManager, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@workspace/ui';
import { useTheme } from 'next-themes';
import { useGitStore } from '@/hooks/use-git-store';
import { SelectionPopover } from '@/components/selection/SelectionPopover';
import { useReviewContext } from '@/hooks/use-review-context';
import type { SelectionInfo } from '@/lib/format-selection-for-ai';
import { useContextParams } from '@/hooks/use-context-params';
import { cn } from '@/lib/utils';
import { X, MoreHorizontal } from 'lucide-react';

interface DiffViewerProps {
  repoPath: string;
  filePath: string;
  originalPath?: string;
}

interface InlineCommentDraft {
  side: 'old' | 'new';
  startLine: number;
  endLine: number;
  selectedText: string;
  beforeContext: string[];
  afterContext: string[];
  diffSide: 'old' | 'new';
}

const SCROLLBAR_CSS = `
  ::-webkit-scrollbar {
    width: 6px;
    height: 6px;
  }
  ::-webkit-scrollbar-track {
    background: transparent;
  }
  ::-webkit-scrollbar-thumb {
    background: rgba(128, 128, 128, 0.2);
    border-radius: 9999px;
  }
  ::-webkit-scrollbar-thumb:hover {
    background: rgba(128, 128, 128, 0.4);
  }
  ::-webkit-scrollbar-corner {
    background: transparent;
  }
`;

export const DiffViewer = ({
  repoPath,
  filePath,
  originalPath,
}: DiffViewerProps) => {
  const { workspaceId } = useContextParams();
  const reviewCtx = useReviewContext({ workspaceId, filePath });
  const snapshotGuidFromPath = originalPath?.startsWith('review-diff://')
    ? originalPath.slice('review-diff://'.length).split('/')[0] ?? null
    : null;
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [oldFile, setOldFile] = useState<FileContents | null>(null);
  const [newFile, setNewFile] = useState<FileContents | null>(null);
  const [workingDiff, setWorkingDiff] = useState<FileDiffMetadata | null>(null);
  const [diffCompareRef, setDiffCompareRef] = useState<string | null>(null);
  const [inlineCommentDraft, setInlineCommentDraft] = useState<InlineCommentDraft | null>(null);
  const [inlineCommentBody, setInlineCommentBody] = useState('');
  const [isSubmittingInlineComment, setIsSubmittingInlineComment] = useState(false);
  const reviewContext = useMemo(() => ({
    session: reviewCtx.currentSession,
    revision: reviewCtx.currentRevision,
    file: reviewCtx.currentFile,
    threads: reviewCtx.threads,
    canEdit: reviewCtx.canEdit,
  }), [reviewCtx.currentSession, reviewCtx.currentRevision, reviewCtx.currentFile, reviewCtx.threads, reviewCtx.canEdit]);

  const [diffStyle, setDiffStyle] = useState<'split' | 'unified'>('split');
  const [wordWrap, setWordWrap] = useState(false);
  const [disableBackground, setDisableBackground] = useState(false);
  const [showTip, setShowTip] = useState(false);
  const [tipPaused, setTipPaused] = useState(false);
  const [fileCollapsed, setFileCollapsed] = useState(false);
  const { resolvedTheme } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);

  const { stagedFiles, unstagedFiles, untrackedFiles, compareFiles, compareRef, compareMode } = useGitStore();
  const diffStats = useMemo(() => {
    const allFiles = compareRef
      ? compareFiles
      : [...stagedFiles, ...unstagedFiles, ...untrackedFiles];
    const file = allFiles.find(f => f.path === filePath);
    return file ? { additions: file.additions, deletions: file.deletions } : null;
  }, [compareFiles, compareRef, stagedFiles, unstagedFiles, untrackedFiles, filePath]);

  useEffect(() => {
    if (tipPaused) return;
    const interval = setInterval(() => {
      setShowTip(prev => !prev);
    }, 5000);
    return () => clearInterval(interval);
  }, [tipPaused]);

  const diffMeta = workingDiff;

  type LineTypeInfo = { type: 'context' | 'addition' | 'deletion' | 'mixed'; oldLine?: number; newLine?: number };
  const lineTypeMap = useMemo(() => {
    const oldMap = new Map<number, LineTypeInfo>();
    const newMap = new Map<number, LineTypeInfo>();
    if (!diffMeta) return { oldMap, newMap };

    for (const hunk of diffMeta.hunks) {
      let oldLine = hunk.deletionStart;
      let newLine = hunk.additionStart;

      for (const content of hunk.hunkContent) {
        if (content.type === 'context') {
          const lineCount = Array.isArray(content.lines)
            ? (content.lines as string[]).length
            : (content.lines as number);
          for (let i = 0; i < lineCount; i++) {
            const info: LineTypeInfo = { type: 'context', oldLine, newLine };
            oldMap.set(oldLine, info);
            newMap.set(newLine, info);
            oldLine++;
            newLine++;
          }
        } else {
          const change = content as ChangeContent;
          const deletionCount = Array.isArray(change.deletions)
            ? change.deletions.length
            : change.deletions;
          const additionCount = Array.isArray(change.additions)
            ? change.additions.length
            : change.additions;
          const hasBoth = deletionCount > 0 && additionCount > 0;
          const lineType = hasBoth ? 'mixed' : (deletionCount > 0 ? 'deletion' : 'addition');
          const delStart = oldLine;
          const addStart = newLine;
          for (let i = 0; i < deletionCount; i++) {
            oldMap.set(oldLine, { type: lineType, oldLine, newLine: addStart });
            oldLine++;
          }
          for (let i = 0; i < additionCount; i++) {
            newMap.set(newLine, { type: lineType, oldLine: delStart, newLine });
            newLine++;
          }
        }
      }
    }
    return { oldMap, newMap };
  }, [diffMeta]);

  const [popoverPosition, setPopoverPosition] = useState({ x: 0, y: 0 });
  const [isPopoverVisible, setIsPopoverVisible] = useState(false);
  const [isPopoverExpanded, setIsPopoverExpanded] = useState(false);
  const [selectionInfo, setSelectionInfo] = useState<SelectionInfo | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  const dismissPopover = useCallback(() => {
    setIsPopoverVisible(false);
    setIsPopoverExpanded(false);
    setSelectionInfo(null);
  }, []);

  const buildSelectionInfo = useCallback((startLine: number, endLine: number, side: 'deletions' | 'additions'): SelectionInfo => {
    const normalizedStart = Math.min(startLine, endLine);
    const normalizedEnd = Math.max(startLine, endLine);
    const sourceContent = side === 'deletions' ? oldFile?.contents : newFile?.contents;

    let selectedText = '';
    if (sourceContent) {
      const lines = sourceContent.split('\n');
      selectedText = lines.slice(normalizedStart - 1, normalizedEnd).join('\n');
    }

    const oldLines = oldFile?.contents?.split('\n') || [];
    const newLines = newFile?.contents?.split('\n') || [];
    const sideMap = side === 'deletions' ? lineTypeMap.oldMap : lineTypeMap.newMap;

    const lineTypes = new Set<string>();
    for (let ln = normalizedStart; ln <= normalizedEnd; ln++) {
      const info = sideMap.get(ln);
      lineTypes.add(info?.type || 'context');
    }

    let changeType: SelectionInfo['changeType'];
    let beforeText: string | undefined;
    let afterText: string | undefined;

    const hasMixed = lineTypes.has('mixed');
    const hasAddition = lineTypes.has('addition');
    const hasDeletion = lineTypes.has('deletion');
    const hasContext = lineTypes.has('context');
    const onlyContext = lineTypes.size === 1 && hasContext;
    const onlyPureAddition = !hasMixed && !hasDeletion && hasAddition;
    const onlyPureDeletion = !hasMixed && !hasAddition && hasDeletion;

    if (onlyContext) {
      changeType = 'context';
      beforeText = oldLines.slice(normalizedStart - 1, normalizedEnd).join('\n');
      afterText = newLines.slice(normalizedStart - 1, normalizedEnd).join('\n');
    } else if (onlyPureAddition) {
      changeType = 'addition';
      beforeText = undefined;
      afterText = newLines.slice(normalizedStart - 1, normalizedEnd).join('\n');
    } else if (onlyPureDeletion) {
      changeType = 'deletion';
      beforeText = oldLines.slice(normalizedStart - 1, normalizedEnd).join('\n');
      afterText = undefined;
    } else {
      changeType = 'mixed';
      let minOtherLine = Infinity;
      let maxOtherLine = -Infinity;
      for (let ln = normalizedStart; ln <= normalizedEnd; ln++) {
        const info = sideMap.get(ln);
        if (info) {
          const otherLine = side === 'deletions' ? info.newLine : info.oldLine;
          if (otherLine != null) {
            minOtherLine = Math.min(minOtherLine, otherLine);
            maxOtherLine = Math.max(maxOtherLine, otherLine);
          }
        }
      }
      if (side === 'deletions') {
        beforeText = oldLines.slice(normalizedStart - 1, normalizedEnd).join('\n');
        afterText = minOtherLine <= maxOtherLine
          ? newLines.slice(minOtherLine - 1, maxOtherLine).join('\n')
          : undefined;
      } else {
        afterText = newLines.slice(normalizedStart - 1, normalizedEnd).join('\n');
        beforeText = minOtherLine <= maxOtherLine
          ? oldLines.slice(minOtherLine - 1, maxOtherLine).join('\n')
          : undefined;
      }
    }

    return {
      filePath: filePath,
      startLine: normalizedStart,
      endLine: normalizedEnd,
      selectedText: selectedText || `Lines ${normalizedStart}-${normalizedEnd}`,
      changeType,
      diffSide: side === 'deletions' ? 'old' : 'new',
      beforeText,
      afterText,
    };
  }, [filePath, lineTypeMap, newFile?.contents, oldFile?.contents]);

  const openInlineCommentDraft = useCallback((draft: InlineCommentDraft) => {
    dismissPopover();
    setInlineCommentBody('');
    setInlineCommentDraft(draft);
  }, [dismissPopover]);

  const handleLineSelectionEnd = useCallback((range: SelectedLineRange | null) => {
    if (!range || !containerRef.current) return;

    const startLine = Math.min(range.start, range.end);
    const endLine = Math.max(range.start, range.end);
    const side = range.side;
    if (!side) return;
    setSelectionInfo(buildSelectionInfo(startLine, endLine, side));

    const container = containerRef.current;
    const containerRect = container.getBoundingClientRect();
    const diffElement = container.querySelector('diffs-container');
    const shadowRoot = diffElement?.shadowRoot;

    let popX = containerRect.width / 2 - 75;
    let popY = 100;

    if (shadowRoot) {
      const sideAttr = side === 'deletions' ? '[data-deletions]' : '[data-additions]';
      const sideContainer = shadowRoot.querySelector(sideAttr);
      const selectedLineEl = sideContainer
        ? sideContainer.querySelector(`[data-line="${endLine}"]`)
        : shadowRoot.querySelector(`[data-line="${endLine}"]`);
      if (selectedLineEl) {
        const lineRect = selectedLineEl.getBoundingClientRect();
        popX = Math.min(lineRect.left - containerRect.left + 50, containerRect.width - 180);
        popY = lineRect.bottom - containerRect.top + 8;
      }
    }

    setPopoverPosition({ x: popX, y: popY });
    setIsPopoverVisible(true);
    setIsPopoverExpanded(false);
  }, [buildSelectionInfo]);

  useEffect(() => {
    if (!isPopoverVisible) return;

    const handleMouseDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (
        popoverRef.current?.contains(target) ||
        target.closest('[data-selection-popover]') ||
        target.closest('[data-radix-popper-content-wrapper]') ||
        target.closest('[data-slot="popover-content"]')
      ) {
        return;
      }
      dismissPopover();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') dismissPopover();
    };

    document.addEventListener('mousedown', handleMouseDown, true);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown, true);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isPopoverVisible, dismissPopover]);

  useEffect(() => {
    const loadDiff = async () => {
      setIsLoading(true);
      setError(null);
      setDiffCompareRef(null);

      try {
        const fileName = filePath.split('/').pop() || filePath;
        if (snapshotGuidFromPath) {
          try {
            const diff = await reviewWsApi.getFileContent(snapshotGuidFromPath);
            const nextOldFile = { name: fileName, contents: diff.old_content };
            const nextNewFile = { name: fileName, contents: diff.new_content };
            setOldFile(nextOldFile);
            setNewFile(nextNewFile);
            setWorkingDiff(parseDiffFromFile(nextOldFile, nextNewFile));
            setDiffCompareRef(null);
          } catch {
            // Fall through to git diff path if review snapshot doesn't exist on disk
            const diff = await gitApi.getFileDiff(repoPath, filePath);
            const nextOldFile = { name: fileName, contents: diff.old_content };
            const nextNewFile = { name: fileName, contents: diff.new_content };
            setOldFile(nextOldFile);
            setNewFile(nextNewFile);
            setWorkingDiff(parseDiffFromFile(nextOldFile, nextNewFile));
            setDiffCompareRef(diff.compare_ref);
          }
        } else {
          const diff = await gitApi.getFileDiff(repoPath, filePath);
          const nextOldFile = { name: fileName, contents: diff.old_content };
          const nextNewFile = { name: fileName, contents: diff.new_content };
          setOldFile(nextOldFile);
          setNewFile(nextNewFile);
          setWorkingDiff(parseDiffFromFile(nextOldFile, nextNewFile));
          setDiffCompareRef(diff.compare_ref);
        }
      } catch (err) {
        console.error('Failed to load diff:', err);
        setError(err instanceof Error ? err.message : 'Failed to load diff');
        setWorkingDiff(null);
      } finally {
        setIsLoading(false);
      }
    };

    loadDiff();
  }, [repoPath, filePath, compareMode, snapshotGuidFromPath]);

  const diffOptions = useMemo(() => ({
    theme: resolvedTheme === 'dark' ? 'pierre-dark' : 'pierre-light' as const,
    diffStyle: diffStyle,
    disableBackground: disableBackground,
    disableFileHeader: true,
    overflow: (wordWrap ? 'wrap' : 'scroll') as 'wrap' | 'scroll',
    unsafeCSS: SCROLLBAR_CSS,
    enableGutterUtility: true,
    enableLineSelection: true,
    onLineSelectionEnd: handleLineSelectionEnd,
  }) satisfies FileDiffOptions<{
    kind: 'thread';
    thread: ReviewThreadDto;
  } | {
    kind: 'composer';
  }>, [resolvedTheme, diffStyle, disableBackground, wordWrap, handleLineSelectionEnd]);

  const threadAnnotations = useMemo<DiffLineAnnotation<{
    kind: 'thread';
    thread: ReviewThreadDto;
  }>[]>(() => {
    return reviewContext.threads.map((thread) => ({
      side: thread.anchor_side === 'old' ? 'deletions' : 'additions',
      lineNumber: thread.anchor_start_line,
      metadata: {
        kind: 'thread',
        thread,
      },
    }));
  }, [reviewContext.threads]);

  const inlineComposerAnnotation = useMemo<DiffLineAnnotation<{
    kind: 'composer';
  }>[]>(
    () =>
      inlineCommentDraft
        ? [{
            side: inlineCommentDraft.side === 'old' ? 'deletions' : 'additions',
            lineNumber: inlineCommentDraft.startLine,
            metadata: { kind: 'composer' },
          }]
        : [],
    [inlineCommentDraft],
  );

  const lineAnnotations = useMemo(
    () => [...threadAnnotations, ...inlineComposerAnnotation],
    [inlineComposerAnnotation, threadAnnotations],
  );

  const handleInlineCommentSubmit = useCallback(async () => {
    if (!reviewContext.session || !reviewContext.revision || !reviewContext.file || !inlineCommentDraft) {
      return;
    }

    const body = inlineCommentBody.trim();
    if (!body) {
      toastManager.add({
        title: 'Comment is empty',
        description: 'Write a short review note before creating a thread.',
        type: 'error',
      });
      return;
    }

    setIsSubmittingInlineComment(true);
    try {
      await reviewWsApi.createThread({
        sessionGuid: reviewContext.session.guid,
        revisionGuid: reviewContext.revision.guid,
        fileSnapshotGuid: reviewContext.file.snapshot.guid,
        anchor: {
          file_path: filePath,
          side: inlineCommentDraft.diffSide,
          start_line: inlineCommentDraft.startLine,
          end_line: inlineCommentDraft.endLine,
          line_range_kind:
            inlineCommentDraft.startLine === inlineCommentDraft.endLine ? 'single' : 'range',
          selected_text: inlineCommentDraft.selectedText,
          before_context: inlineCommentDraft.beforeContext,
          after_context: inlineCommentDraft.afterContext,
          hunk_header: null,
        },
        body,
      });
      setInlineCommentBody('');
      setInlineCommentDraft(null);
    } catch (error) {
      toastManager.add({
        title: 'Failed to create review comment',
        description:
          error instanceof Error ? error.message : 'Unknown review comment error',
        type: 'error',
      });
    } finally {
      setIsSubmittingInlineComment(false);
    }
  }, [filePath, inlineCommentBody, inlineCommentDraft, reviewContext.file, reviewContext.revision, reviewContext.session]);

  const handleToggleReviewed = useCallback(async (reviewed: boolean) => {
    if (!reviewContext.file) return;
    try {
      await reviewWsApi.setFileReviewed({
        fileStateGuid: reviewContext.file.state.guid,
        reviewed,
      });
    } catch (error) {
      toastManager.add({
        title: 'Failed to update file review state',
        description:
          error instanceof Error ? error.message : 'Unknown review state error',
        type: 'error',
      });
    }
  }, [reviewContext.file]);



  const renderGutterUtility = useCallback((getHoveredLine: () => { lineNumber: number; side: 'deletions' | 'additions' } | undefined) => {
    if (!snapshotGuidFromPath || !reviewContext.canEdit || !reviewContext.file) return null;

    return (
      <button
        type="button"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: 'none',
          width: '1lh',
          height: '1lh',
          marginRight: 'calc((1lh - 1ch) * -1)',
          padding: 0,
          cursor: 'pointer',
          borderRadius: 4,
          backgroundColor: 'var(--diffs-modified-base, #0969da)',
          color: 'var(--diffs-bg, #fff)',
          fill: 'currentColor',
          position: 'relative',
          zIndex: 4,
        }}
        onMouseDown={(event) => event.preventDefault()}
        onClick={(event) => {
          event.preventDefault();
          const hoveredLine = getHoveredLine();
          if (!hoveredLine || !hoveredLine.side) return;
          const info = buildSelectionInfo(hoveredLine.lineNumber, hoveredLine.lineNumber, hoveredLine.side);
          openInlineCommentDraft({
            side: info.diffSide === 'old' ? 'old' : 'new',
            diffSide: info.diffSide === 'old' ? 'old' : 'new',
            startLine: info.startLine,
            endLine: info.endLine,
            selectedText: info.selectedText,
            beforeContext: [],
            afterContext: [],
          });
        }}
        aria-label="Add review comment"
      >
        <svg width={14} height={14} viewBox="0 0 16 16" fill="none">
          <path d="M8 3a.75.75 0 0 1 .75.75v3.5h3.5a.75.75 0 0 1 0 1.5h-3.5v3.5a.75.75 0 0 1-1.5 0v-3.5h-3.5a.75.75 0 0 1 0-1.5h3.5v-3.5A.75.75 0 0 1 8 3" fill="currentColor" />
        </svg>
      </button>
    );
  }, [buildSelectionInfo, openInlineCommentDraft, reviewContext.canEdit, reviewContext.file, snapshotGuidFromPath]);

  const renderAnnotation = useCallback((annotation: DiffLineAnnotation<{
    kind: 'thread';
    thread: ReviewThreadDto;
  } | {
    kind: 'composer';
  }>) => {
    if (annotation.metadata?.kind === 'composer') {
      if (!inlineCommentDraft) return null;
      return (
        <div className="mx-3 my-2 rounded-lg border border-primary/20 bg-background/95 p-3 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-foreground">
                Comment on {inlineCommentDraft.startLine === inlineCommentDraft.endLine ? `L${inlineCommentDraft.startLine}` : `L${inlineCommentDraft.startLine}-L${inlineCommentDraft.endLine}`}
              </p>
              <p className="text-xs text-muted-foreground">
                Add a review comment directly on this diff.
              </p>
            </div>
            <button
              type="button"
              className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              onClick={() => {
                setInlineCommentDraft(null);
                setInlineCommentBody('');
              }}
              aria-label="Cancel comment"
            >
              <X className="size-4" />
            </button>
          </div>
          <Textarea
            value={inlineCommentBody}
            onChange={(event) => setInlineCommentBody(event.target.value)}
            placeholder="Describe the issue or expected change..."
            className="mt-3 min-h-24 bg-background"
            autoFocus
          />
          <div className="mt-3 flex items-center gap-2">
            <Button size="sm" onClick={() => void handleInlineCommentSubmit()} disabled={isSubmittingInlineComment}>
              {isSubmittingInlineComment ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              Add Comment
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setInlineCommentDraft(null);
                setInlineCommentBody('');
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      );
    }

    const thread = annotation.metadata?.thread;
    if (!thread) return null;
    return (
      <div className={cn(
        'mx-3 my-2 rounded-lg border p-3 shadow-sm',
        thread.status === 'fixed'
          ? 'border-emerald-500/25 bg-emerald-500/5'
          : thread.status === 'agent_fixed'
            ? 'border-amber-500/25 bg-amber-500/5'
            : thread.status === 'dismissed'
              ? 'border-muted-foreground/15 bg-muted/30'
              : 'border-blue-500/25 bg-blue-500/5',
      )}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">
              {thread.title?.trim() || `Comment on L${thread.anchor_start_line}${thread.anchor_start_line === thread.anchor_end_line ? '' : `-${thread.anchor_end_line}`}`}
            </p>
            <p className="text-xs text-muted-foreground">
              {thread.status === 'agent_fixed' ? 'Agent Fixed' : thread.status === 'dismissed' ? 'Dismissed' : thread.status.charAt(0).toUpperCase() + thread.status.slice(1)}
            </p>
          </div>
        </div>
        <div className="mt-3 space-y-2">
          {thread.messages.map((message) => (
            <div
              key={message.guid}
              className={cn(
                'rounded-md border px-3 py-2 text-sm',
                message.author_type === 'user'
                  ? 'border-border bg-muted/50'
                  : 'border-sky-500/20 bg-sky-500/5',
              )}
            >
              <div className="mb-1 flex items-center justify-between gap-2 text-[11px] font-medium tracking-wide text-muted-foreground">
                <span className="capitalize">{message.author_type === 'user' ? 'you' : message.author_type}</span>
                <span>{new Intl.DateTimeFormat(undefined, {
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                }).format(new Date(message.created_at))}</span>
              </div>
              <p className="whitespace-pre-wrap break-words text-foreground">{message.body_full}</p>
            </div>
          ))}
        </div>
      </div>
    );
  }, [handleInlineCommentSubmit, inlineCommentBody, inlineCommentDraft, isSubmittingInlineComment]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full bg-background">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full bg-background">
        <div className="text-center">
          <p className="text-red-500 mb-2">Error loading diff</p>
          <p className="text-sm text-muted-foreground">{error}</p>
        </div>
      </div>
    );
  }

  if (!oldFile || !newFile || !workingDiff) {
    return (
      <div className="flex items-center justify-center h-full bg-background">
        <p className="text-muted-foreground">No diff available</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-background overflow-hidden">
      <div className="h-10 flex items-center justify-between px-4 border-b border-sidebar-border bg-muted/30 shrink-0">
        <button
          type="button"
          onClick={() => setFileCollapsed(!fileCollapsed)}
          className="flex items-center justify-center w-5 h-5 rounded text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors cursor-pointer shrink-0 mr-2"
          aria-label={fileCollapsed ? 'Expand file' : 'Collapse file'}
        >
          {fileCollapsed ? (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M6 4L10 8L6 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M4 6L8 10L12 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          )}
        </button>
        <div
          className="relative h-5 flex-1 min-w-0 overflow-hidden mr-3"
          onMouseEnter={() => setTipPaused(true)}
          onMouseLeave={() => setTipPaused(false)}
        >
          <div
            className="absolute inset-x-0 h-full flex items-center gap-3 transition-all duration-500 ease-in-out"
            style={{ transform: showTip ? 'translateY(-100%)' : 'translateY(0)', opacity: showTip ? 0 : 1 }}
          >
            <span className="text-sm font-medium text-foreground truncate">{filePath}</span>
            {diffCompareRef && <span className="text-xs text-muted-foreground shrink-0">vs {diffCompareRef}</span>}
            {snapshotGuidFromPath && reviewContext.session && !reviewContext.canEdit ? (
              <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-300">
                Snapshot View
              </span>
            ) : null}
            {diffStats && (diffStats.additions > 0 || diffStats.deletions > 0) && (
              <span className="text-xs font-mono shrink-0">
                {diffStats.additions > 0 && <span className="text-green-500">+{diffStats.additions}</span>}
                {diffStats.additions > 0 && diffStats.deletions > 0 && <span className="text-muted-foreground mx-1">/</span>}
                {diffStats.deletions > 0 && <span className="text-red-500">-{diffStats.deletions}</span>}
              </span>
            )}
          </div>
          <div
            className="absolute inset-x-0 h-full flex items-center transition-all duration-500 ease-in-out"
            style={{ transform: showTip ? 'translateY(0)' : 'translateY(100%)', opacity: showTip ? 1 : 0 }}
          >
            <span className="text-xs text-muted-foreground truncate">
              Tips: Select line numbers to annotate changes and quickly send to AI Agent (⇧ Shift for multi-select)
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {(() => {
            if (!snapshotGuidFromPath) return null;
            const file = reviewContext.file;
            if (!file) return null;
            const reviewed = file.state.reviewed;
            return (
              <button
                type="button"
                onClick={() => handleToggleReviewed(!reviewed)}
                disabled={!reviewContext.canEdit}
                className={cn(
                  'flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer disabled:cursor-not-allowed shrink-0',
                  reviewed
                    ? 'border-blue-500/50 bg-blue-500/15 text-blue-300 hover:bg-blue-500/25'
                    : 'border-border bg-background/80 text-foreground hover:bg-muted/50'
                )}
              >
                {reviewed ? (
                  <span className="flex items-center justify-center w-3.5 h-3.5 rounded-sm bg-blue-500">
                    <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
                      <path d="M3 8L6.5 11.5L13 5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </span>
                ) : (
                  <span className="flex items-center justify-center w-3.5 h-3.5 rounded-sm border border-muted-foreground/40" />
                )}
                <span>Reviewed</span>
              </button>
            );
          })()}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex items-center justify-center size-6 rounded-md text-muted-foreground hover:text-foreground hover:bg-sidebar-accent transition-colors cursor-pointer"
                title="More actions"
              >
                <MoreHorizontal className="size-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[10rem]">
              <DropdownMenuItem
                onSelect={(e) => e.preventDefault()}
                onClick={() => setWordWrap(!wordWrap)}
                className="text-xs"
              >
                {wordWrap ? "Scroll" : "Wrap"}
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={(e) => e.preventDefault()}
                onClick={() => setDiffStyle(diffStyle === 'unified' ? 'split' : 'unified')}
                className="text-xs"
              >
                {diffStyle === 'unified' ? "Split" : "Unified"}
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={(e) => e.preventDefault()}
                onClick={() => setDisableBackground(!disableBackground)}
                className="text-xs"
              >
                {disableBackground ? "Show BG" : "No BG"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden">
        <div
          ref={containerRef}
          className="diff-viewer-container min-h-0 h-full w-full overflow-auto bg-background relative"
          style={{ height: '100%', scrollbarGutter: 'stable' }}
        >
          <SelectionPopover
            isVisible={isPopoverVisible}
            position={popoverPosition}
            selectionInfo={selectionInfo}
            isExpanded={isPopoverExpanded}
            onExpand={() => setIsPopoverExpanded(true)}
            onDismiss={dismissPopover}
            type="diff"
            popoverRef={popoverRef}
            positioning="absolute"
          />
          <div
            className="grid transition-[grid-template-rows] duration-300 ease-in-out"
            style={{ gridTemplateRows: fileCollapsed ? '0fr' : '1fr' }}
          >
            <div className="overflow-hidden">
              <FileDiff
                fileDiff={workingDiff}
                options={diffOptions}
                lineAnnotations={lineAnnotations}
                renderAnnotation={renderAnnotation}
                renderGutterUtility={renderGutterUtility}
                style={{ minHeight: '100%', width: '100%' }}
              />
            </div>
          </div>
        </div>

        </div>
    </div>
  );
};
