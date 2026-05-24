'use client';

import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { FileDiff, Virtualizer } from '@pierre/diffs/react';
import type {
  DiffLineAnnotation,
  FileContents,
  FileDiffOptions,
  SelectedLineRange,
  FileDiffMetadata,
} from '@pierre/diffs';
import { parseDiffFromFile } from '@pierre/diffs';
import { useTheme } from 'next-themes';
import { gitApi, reviewWsApi } from '@/api/ws-api';
import type { ReviewMessageDto, ReviewCommentDto } from '@/api/ws-api';
import { Loader2, toastManager } from '@workspace/ui';
import { useGitStore } from '@/features/git/store/use-git-store';
import { useEditorStore } from '@/features/editor/store/use-editor-store';
import { SelectionPopover } from '@/features/selection/components/SelectionPopover';
import { useReviewCtx } from '@/features/diff/components/review/ReviewContextProvider';
import type { SelectionInfo } from '@/shared/lib/format-selection-for-ai';
import { useContextParams } from '@/shared/hooks/use-context-params';
import {
  type DiffViewerAnnotationMeta,
  type DiffViewerInlineCommentDraft,
  DiffViewerReviewAnnotation,
} from '@/features/diff/components/diff-viewer-review-annotations';
import {
  DIFF_VIRTUALIZER_SCROLL_CLASS,
  buildDiffViewerLineTypeMap,
  buildDiffViewerSelectionInfo,
  getDiffScrollRoot,
} from '@/features/diff/lib/diff-viewer-selection';
import {
  ATMOS_DIFF_THEME,
  buildSharedDiffViewOptions,
  getAtmosDiffThemeType,
} from '@/features/diff/lib/diff-view-constants';
import { DiffViewerHeader } from '@/features/diff/components/DiffViewerHeader';
import { useDiffSettings } from '@/features/settings/hooks/use-diff-settings';

interface DiffViewerProps {
  repoPath: string;
  filePath: string;
  originalPath?: string;
}

export const DiffViewer = ({
  repoPath,
  filePath,
  originalPath,
}: DiffViewerProps) => {
  const { resolvedTheme } = useTheme();
  const { effectiveContextId } = useContextParams();
  const snapshotGuidFromPath = originalPath?.startsWith('review-diff://')
    ? originalPath.slice('review-diff://'.length).split('/')[0] || null
    : null;
  const isReviewDiff = Boolean(snapshotGuidFromPath);
  const reviewCtx = useReviewCtx();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [oldFile, setOldFile] = useState<FileContents | null>(null);
  const [newFile, setNewFile] = useState<FileContents | null>(null);
  const [workingDiff, setWorkingDiff] = useState<FileDiffMetadata | null>(null);
  const [diffCompareRef, setDiffCompareRef] = useState<string | null>(null);
  const [inlineCommentDraft, setInlineCommentDraft] = useState<DiffViewerInlineCommentDraft | null>(null);
  const [inlineCommentBody, setInlineCommentBody] = useState('');
  const [isSubmittingInlineComment, setIsSubmittingInlineComment] = useState(false);
  const inlineCommentTextareaRef = useRef<HTMLTextAreaElement>(null);
  const [replyDraftCommentGuid, setReplyDraftCommentGuid] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState('');
  const [isSubmittingReply, setIsSubmittingReply] = useState(false);
  const [deletingMessageGuid, setDeletingMessageGuid] = useState<string | null>(null);
  const [collapsedInlineCommentGuids, setCollapsedInlineCommentGuids] = useState<Set<string>>(() => new Set());
  const [highlightedInlineCommentGuid, setHighlightedInlineCommentGuid] = useState<string | null>(null);
  const [highlightedInlineMessageGuid, setHighlightedInlineMessageGuid] = useState<string | null>(null);
  const reviewContext = useMemo(() => ({
    session: reviewCtx.currentSession,
    revision: reviewCtx.currentRevision,
    file: reviewCtx.currentFile,
    comments: reviewCtx.comments,
    canEdit: reviewCtx.canEdit,
    replyToComment: reviewCtx.handleReplyToComment,
    updateMessage: reviewCtx.handleUpdateMessage,
    deleteMessage: reviewCtx.handleDeleteMessage,
  }), [
    reviewCtx.currentSession,
    reviewCtx.currentRevision,
    reviewCtx.currentFile,
    reviewCtx.comments,
    reviewCtx.canEdit,
    reviewCtx.handleReplyToComment,
    reviewCtx.handleUpdateMessage,
    reviewCtx.handleDeleteMessage,
  ]);

  const {
    diffStyle,
    showBackgrounds,
    lineNumbers,
    wordWrap,
    diffIndicators,
    loadSettings: loadDiffSettings,
    setDiffStyle,
    setShowBackgrounds,
    setWordWrap,
  } = useDiffSettings();
  const [showTip, setShowTip] = useState(false);
  const [tipPaused, setTipPaused] = useState(false);
  const [fileCollapsed, setFileCollapsed] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const clearNavigationTarget = useEditorStore((state) => state.clearNavigationTarget);
  const navigationTarget = useEditorStore((state) =>
    effectiveContextId && originalPath
      ? state.navigationTargets[effectiveContextId]?.[originalPath] ?? null
      : null,
  );

  const { stagedFiles, unstagedFiles, untrackedFiles, compareFiles, compareRef, compareMode } = useGitStore();

  useEffect(() => {
    void loadDiffSettings();
  }, [loadDiffSettings]);

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
  const lineTypeMap = useMemo(() => {
    return buildDiffViewerLineTypeMap(diffMeta);
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

  const toggleInlineCommentExpanded = useCallback((commentGuid: string) => {
    setCollapsedInlineCommentGuids((prev) => {
      const next = new Set(prev);
      if (next.has(commentGuid)) {
        next.delete(commentGuid);
      } else {
        next.add(commentGuid);
      }
      return next;
    });
  }, []);

  const buildSelectionInfo = useCallback((startLine: number, endLine: number, side: 'deletions' | 'additions'): SelectionInfo => {
    return buildDiffViewerSelectionInfo({
      filePath,
      oldContent: oldFile?.contents,
      newContent: newFile?.contents,
      lineTypeMap,
      startLine,
      endLine,
      side,
    });
  }, [filePath, lineTypeMap, newFile?.contents, oldFile?.contents]);

  const openInlineCommentDraft = useCallback((draft: DiffViewerInlineCommentDraft) => {
    dismissPopover();
    setInlineCommentBody('');
    setInlineCommentDraft(draft);
  }, [dismissPopover]);

  // Reliably focus the inline composer textarea once it mounts. Native
  // `autoFocus` is unreliable here because the composer is rendered through
  // FileDiff's annotation slot (which can mount asynchronously / in a
  // shadow root); use rAF to wait for the element to be in the DOM.
  useEffect(() => {
    if (!inlineCommentDraft) return;
    let cancelled = false;
    const tryFocus = () => {
      if (cancelled) return;
      const el = inlineCommentTextareaRef.current;
      if (el) {
        el.focus();
        return;
      }
      requestAnimationFrame(tryFocus);
    };
    requestAnimationFrame(tryFocus);
    return () => {
      cancelled = true;
    };
  }, [inlineCommentDraft]);

  const handleLineSelectionEnd = useCallback((range: SelectedLineRange | null) => {
    if (!range || !containerRef.current) return;

    const startLine = Math.min(range.start, range.end);
    const endLine = Math.max(range.start, range.end);
    const side = range.endSide ?? range.side;
    if (!side) return;
    const selection = buildSelectionInfo(startLine, endLine, side);

    if (isReviewDiff) {
      if (!reviewContext.canEdit || !reviewContext.file) return;
      openInlineCommentDraft({
        side: selection.diffSide === 'old' ? 'old' : 'new',
        diffSide: selection.diffSide === 'old' ? 'old' : 'new',
        startLine: selection.startLine,
        endLine: selection.endLine,
        selectedText: selection.selectedText,
        beforeContext: selection.beforeText ? selection.beforeText.split('\n') : [],
        afterContext: selection.afterText ? selection.afterText.split('\n') : [],
      });
      return;
    }

    setSelectionInfo(selection);

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
  }, [buildSelectionInfo, isReviewDiff, openInlineCommentDraft, reviewContext.canEdit, reviewContext.file]);

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
          } catch (err) {
            // Only fall through to git diff for "snapshot not found" errors
            // Re-throw server errors, network failures, and other non-recoverable errors
            const isNotFoundError =
              err instanceof Error &&
              (err.message.includes('404') ||
                err.message.includes('Not Found') ||
                err.message.toLowerCase().includes('snapshot not found'));
            if (!isNotFoundError) {
              throw err;
            }
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

  const diffOptions = useMemo(() => {
    const sharedOptions = buildSharedDiffViewOptions({
      theme: ATMOS_DIFF_THEME,
      themeType: getAtmosDiffThemeType(resolvedTheme),
      diffStyle,
      wordWrap,
      disableBackground: !showBackgrounds,
      lineNumbers,
      diffIndicators,
      enableGutterUtility: true,
      enableLineSelection: true,
    });

    return {
      ...sharedOptions,
      disableFileHeader: true,
      onLineSelectionEnd: handleLineSelectionEnd,
    } satisfies FileDiffOptions<DiffViewerAnnotationMeta>;
  }, [
    diffIndicators,
    diffStyle,
    handleLineSelectionEnd,
    lineNumbers,
    resolvedTheme,
    showBackgrounds,
    wordWrap,
  ]);

  const commentAnnotations = useMemo(() => {
    if (!isReviewDiff || !reviewContext.file) return [];
    const fileSnapshotGuid = reviewContext.file.snapshot.guid;
    return reviewContext.comments
      .filter((comment) => comment.file_snapshot_guid === fileSnapshotGuid)
      .map((comment) => ({
        side: comment.anchor_side === 'old' ? 'deletions' : 'additions',
        lineNumber: comment.anchor_start_line,
        metadata: {
          kind: 'comment' as const,
          comment,
        },
      }));
  }, [reviewContext.file, reviewContext.comments, isReviewDiff]);

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
    () => [...commentAnnotations, ...inlineComposerAnnotation] as unknown as DiffLineAnnotation<DiffViewerAnnotationMeta>[],
    [inlineComposerAnnotation, commentAnnotations],
  );

  // Track which navigationTarget object identity we've already attempted to scroll to.
  // This prevents the effect from re-scrolling when unrelated state (e.g. WS comment
  // updates) changes — without it, every `reviewContext.comments` mutation would
  // re-fire scrollIntoView and yank the user's manual scroll back to the anchor.
  const lastHandledNavRef = useRef<unknown>(null);

  useEffect(() => {
    if (!navigationTarget || !originalPath || !effectiveContextId || isLoading) return;
    if (lastHandledNavRef.current === navigationTarget) return;

    const targetCommentGuid = navigationTarget.reviewCommentGuid;
    const targetMessageGuid = navigationTarget.reviewMessageGuid;
    const targetLine = navigationTarget.line;

    // Expand the target comment immediately and start the highlight pulse so
    // the message DOM node is available to scroll to. Doing this synchronously
    // (rather than only when the element is found) means the pierre annotation
    // re-renders right away and the polling below can finish quickly.
    if (targetCommentGuid) {
      setCollapsedInlineCommentGuids((prev) => {
        if (!prev.has(targetCommentGuid)) return prev;
        const next = new Set(prev);
        next.delete(targetCommentGuid);
        return next;
      });
      if (targetMessageGuid) {
        setHighlightedInlineMessageGuid(targetMessageGuid);
      } else {
        setHighlightedInlineCommentGuid(targetCommentGuid);
      }
    }

    let cancelled = false;
    let attempts = 0;
    // ~3s of polling at ~100ms cadence — comfortably covers the worst case
    // where the file/diff parses and pierre/diffs renders the annotation row
    // after the navigationTarget was set.
    const MAX_ATTEMPTS = 30;
    const POLL_INTERVAL_MS = 100;
    let timerId: number | undefined;

    const queryTarget = (
      root: ParentNode | null | undefined,
      selector: string,
    ): HTMLElement | null => {
      if (!root) return null;
      return root.querySelector<HTMLElement>(selector);
    };

    const findTarget = (): HTMLElement | null => {
      const container = containerRef.current;
      if (!container) return null;
      const diffElement = container.querySelector('diffs-container');
      const shadowRoot = diffElement?.shadowRoot;
      if (targetMessageGuid) {
        const selector = `[data-review-message-guid="${targetMessageGuid}"]`;
        return queryTarget(container, selector) ?? queryTarget(shadowRoot, selector);
      }
      if (targetCommentGuid) {
        const selector = `[data-review-comment-guid="${targetCommentGuid}"]`;
        return queryTarget(container, selector) ?? queryTarget(shadowRoot, selector);
      }
      if (typeof targetLine === 'number') {
        const selector = `[data-review-anchor-line="${targetLine}"]`;
        return queryTarget(container, selector) ?? queryTarget(shadowRoot, selector);
      }
      return null;
    };

    const scrollTargetIntoContainer = (target: HTMLElement) => {
      const scrollRoot = getDiffScrollRoot(containerRef.current);
      if (!scrollRoot) return;

      const containerRect = scrollRoot.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      const currentTop = scrollRoot.scrollTop;
      const offsetWithinContainer =
        targetRect.top - containerRect.top + currentTop;
      const centeredTop =
        offsetWithinContainer - scrollRoot.clientHeight / 2 + targetRect.height / 2;

      scrollRoot.scrollTo({
        top: Math.max(0, centeredTop),
        behavior: 'smooth',
      });
    };

    const finalize = () => {
      lastHandledNavRef.current = navigationTarget;
      clearNavigationTarget(originalPath, effectiveContextId);
    };

    const tryScroll = () => {
      if (cancelled) return;
      const target = findTarget();
      if (target) {
        scrollTargetIntoContainer(target);
        finalize();
        return;
      }
      attempts += 1;
      if (attempts >= MAX_ATTEMPTS) {
        // Give up so we don't retain a dangling navigationTarget that would
        // re-trigger a scroll the next time isLoading flips.
        finalize();
        return;
      }
      timerId = window.setTimeout(tryScroll, POLL_INTERVAL_MS);
    };

    const frameId = requestAnimationFrame(tryScroll);

    return () => {
      cancelled = true;
      cancelAnimationFrame(frameId);
      if (timerId !== undefined) window.clearTimeout(timerId);
    };
  }, [
    clearNavigationTarget,
    effectiveContextId,
    filePath,
    isLoading,
    navigationTarget,
    originalPath,
  ]);

  useEffect(() => {
    if (!highlightedInlineCommentGuid) return;
    const timer = window.setTimeout(() => {
      setHighlightedInlineCommentGuid(null);
    }, 2000);
    return () => window.clearTimeout(timer);
  }, [highlightedInlineCommentGuid]);

  useEffect(() => {
    if (!highlightedInlineMessageGuid) return;
    const timer = window.setTimeout(() => {
      setHighlightedInlineMessageGuid(null);
    }, 2000);
    return () => window.clearTimeout(timer);
  }, [highlightedInlineMessageGuid]);

  const handleInlineCommentSubmit = useCallback(async () => {
    if (!reviewContext.session || !reviewContext.revision || !reviewContext.file || !inlineCommentDraft) {
      return;
    }

    const body = inlineCommentBody.trim();
    if (!body) {
      toastManager.add({
        title: 'Comment is empty',
        description: 'Write a short review note before creating a comment.',
        type: 'error',
      });
      return;
    }

    setIsSubmittingInlineComment(true);
    try {
      await reviewWsApi.createComment({
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

  const handleCommentReplySubmit = useCallback(async (comment: ReviewCommentDto) => {
    const body = replyBody.trim();
    if (!body) {
      toastManager.add({
        title: 'Reply is empty',
        description: 'Write a short reply before sending.',
        type: 'error',
      });
      return;
    }

    setIsSubmittingReply(true);
    try {
      await reviewContext.replyToComment(comment, body);
      setReplyBody('');
      setReplyDraftCommentGuid(null);
    } catch {
      // The shared review hook already shows the failure toast.
    } finally {
      setIsSubmittingReply(false);
    }
  }, [replyBody, reviewContext]);

  const handleDeleteMessage = useCallback(async (
    comment: ReviewCommentDto,
    message: ReviewMessageDto,
  ) => {
    setDeletingMessageGuid(message.guid);
    try {
      await reviewContext.deleteMessage(comment, message);
    } catch {
      // The shared review hook already shows the failure toast.
    } finally {
      setDeletingMessageGuid(null);
    }
  }, [reviewContext]);



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

  const cancelInlineCommentDraft = useCallback(() => {
    setInlineCommentDraft(null);
    setInlineCommentBody('');
  }, []);

  const cancelReplyDraft = useCallback(() => {
    setReplyDraftCommentGuid(null);
    setReplyBody('');
  }, []);

  const toggleReplyDraft = useCallback((commentGuid: string) => {
    setReplyBody('');
    setCollapsedInlineCommentGuids((prev) => {
      if (!prev.has(commentGuid)) return prev;
      const next = new Set(prev);
      next.delete(commentGuid);
      return next;
    });
    setReplyDraftCommentGuid((value) =>
      value === commentGuid ? null : commentGuid,
    );
  }, []);

  const renderAnnotation = useCallback((annotation: DiffLineAnnotation<DiffViewerAnnotationMeta>) => (
    <DiffViewerReviewAnnotation
      annotation={annotation}
      inlineCommentDraft={inlineCommentDraft}
      inlineCommentTextareaRef={inlineCommentTextareaRef}
      inlineCommentBody={inlineCommentBody}
      isSubmittingInlineComment={isSubmittingInlineComment}
      replyBody={replyBody}
      replyDraftCommentGuid={replyDraftCommentGuid}
      isSubmittingReply={isSubmittingReply}
      deletingMessageGuid={deletingMessageGuid}
      collapsedInlineCommentGuids={collapsedInlineCommentGuids}
      highlightedInlineCommentGuid={highlightedInlineCommentGuid}
      highlightedInlineMessageGuid={highlightedInlineMessageGuid}
      canEditReview={reviewContext.canEdit}
      onInlineCommentBodyChange={setInlineCommentBody}
      onInlineCommentSubmit={() => void handleInlineCommentSubmit()}
      onInlineCommentCancel={cancelInlineCommentDraft}
      onReplyBodyChange={setReplyBody}
      onReplySubmit={(comment) => void handleCommentReplySubmit(comment)}
      onReplyCancel={cancelReplyDraft}
      onToggleReplyDraft={toggleReplyDraft}
      onToggleInlineCommentExpanded={toggleInlineCommentExpanded}
      onUpdateMessage={reviewContext.updateMessage}
      onDeleteMessage={(comment, message) => void handleDeleteMessage(comment, message)}
    />
  ), [
    cancelInlineCommentDraft,
    cancelReplyDraft,
    collapsedInlineCommentGuids,
    deletingMessageGuid,
    handleCommentReplySubmit,
    handleDeleteMessage,
    handleInlineCommentSubmit,
    highlightedInlineCommentGuid,
    highlightedInlineMessageGuid,
    inlineCommentBody,
    inlineCommentDraft,
    isSubmittingInlineComment,
    isSubmittingReply,
    replyBody,
    replyDraftCommentGuid,
    reviewContext.canEdit,
    reviewContext.updateMessage,
    toggleReplyDraft,
    toggleInlineCommentExpanded,
  ]);

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
      <DiffViewerHeader
        canEditReview={reviewContext.canEdit}
        diffCompareRef={diffCompareRef}
        diffStats={diffStats}
        diffStyle={diffStyle}
        disableBackground={!showBackgrounds}
        fileCollapsed={fileCollapsed}
        filePath={filePath}
        hasReviewSession={Boolean(reviewContext.session)}
        isReviewDiff={isReviewDiff}
        isReviewed={snapshotGuidFromPath && reviewContext.file ? reviewContext.file.state.reviewed : null}
        onToggleReviewed={handleToggleReviewed}
        setDiffStyle={setDiffStyle}
        setDisableBackground={(disabled) => void setShowBackgrounds(!disabled)}
        setFileCollapsed={setFileCollapsed}
        setTipPaused={setTipPaused}
        setWordWrap={setWordWrap}
        showTip={showTip}
        snapshotGuidFromPath={snapshotGuidFromPath}
        wordWrap={wordWrap}
      />

      <div className="relative min-h-0 flex-1 overflow-hidden">
        <div
          ref={containerRef}
          className="diff-viewer-container min-h-0 h-full w-full overflow-hidden bg-background relative"
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
            <div className="min-h-0 h-full overflow-hidden">
              <Virtualizer
                className={`${DIFF_VIRTUALIZER_SCROLL_CLASS} h-full min-h-0 overflow-auto`}
                style={{ scrollbarGutter: 'stable' }}
              >
                <FileDiff
                  fileDiff={workingDiff}
                  options={diffOptions}
                  lineAnnotations={lineAnnotations}
                  renderAnnotation={renderAnnotation}
                  renderGutterUtility={renderGutterUtility}
                  style={{ minHeight: '100%', width: '100%' }}
                />
              </Virtualizer>
            </div>
          </div>
        </div>

        </div>
    </div>
  );
};
