'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CodeView, type CodeViewHandle } from '@pierre/diffs/react';
import type {
  CodeViewItem,
  DiffLineAnnotation,
  SelectedLineRange,
} from '@pierre/diffs';
import { parseDiffFromFile } from '@pierre/diffs';
import type { ReviewCommentDto, ReviewFileDto, ReviewMessageDto } from '@/api/ws-api';
import { reviewWsApi } from '@/api/ws-api';
import { useReviewCtx } from '@/components/diff/review/ReviewContextProvider';
import { useEditorStore } from '@/hooks/use-editor-store';
import { useContextParams } from '@/hooks/use-context-params';
import { useDiffWorkerPoolReady } from '@/components/diff/DiffWorkerPoolProvider';
import { DiffCodeViewScaffold } from '@/components/diff/DiffCodeViewScaffold';
import { DiffCodeViewSettingsMenu } from '@/components/diff/DiffCodeViewSettingsMenu';
import { sortByDiffTreePath } from '@/components/diff/diff-file-order';
import {
  buildDiffSelectionInfo,
  formatSelectedRangeLabel,
  getNextItemVersion,
  updateViewerDiffItem,
} from '@/components/diff/diff-code-view-shared';
import {
  ATMOS_DIFF_THEME,
  buildSharedDiffViewOptions,
  CODE_VIEW_HOST_CLASS,
} from '@/components/diff/diff-view-constants';
import {
  createDiffHeaderPrefixRenderer,
  findDiffItemIdForViewport,
  scrollCodeViewToItem,
} from '@/components/diff/code-view-ui';
import { MessageBubble } from '@/components/diff/review/MessageBubble';
import { ReviewMessageActionsMenu } from '@/components/diff/review/ReviewMessageActionsMenu';
import {
  reviewCommentStatusLabel,
  statusTone,
} from '@/components/diff/review/utils';
import { cn } from '@/lib/utils';
import {
  Button,
  Loader2,
  Textarea,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  toastManager,
} from '@workspace/ui';
import {
  ChevronRight,
  Command,
  CornerDownLeft,
  X,
} from 'lucide-react';

const CODE_VIEW_BATCH_SIZE = 25;

function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, 0));
}

type ReviewAnnotationMeta =
  | {
      kind: 'comment';
      comment: ReviewCommentDto;
    }
  | {
      kind: 'composer';
    };

interface InlineCommentDraft {
  itemId: string;
  filePath: string;
  fileSnapshotGuid: string;
  diffSide: 'old' | 'new';
  startLine: number;
  endLine: number;
  selectedText: string;
  beforeContext: string[];
  afterContext: string[];
}

interface ReviewCodeViewProps {
  groupPath: string;
}

export function ReviewCodeView({ groupPath }: ReviewCodeViewProps) {
  const { effectiveContextId } = useContextParams();
  const workerPoolReady = useDiffWorkerPoolReady();
  const reviewCtx = useReviewCtx();
  const clearNavigationTarget = useEditorStore((s) => s.clearNavigationTarget);
  const setDiffGroupActiveFile = useEditorStore((s) => s.setDiffGroupActiveFile);
  const selectedPath = useEditorStore((s) =>
    effectiveContextId ? s.diffGroupActiveFiles[effectiveContextId]?.[groupPath] : undefined,
  );
  const navigationTarget = useEditorStore((s) =>
    effectiveContextId ? s.navigationTargets[effectiveContextId]?.[groupPath] ?? null : null,
  );

  const [isLoading, setIsLoading] = useState(true);
  const [hasLoadedAllItems, setHasLoadedAllItems] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [initialItems, setInitialItems] = useState<CodeViewItem<ReviewAnnotationMeta>[]>([]);
  const [annotationVersion, setAnnotationVersion] = useState(0);
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
  const [inlineCommentDraft, setInlineCommentDraft] =
    useState<InlineCommentDraft | null>(null);
  const [inlineCommentBody, setInlineCommentBody] = useState('');
  const [isSubmittingInlineComment, setIsSubmittingInlineComment] = useState(false);
  const [replyDraftCommentGuid, setReplyDraftCommentGuid] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState('');
  const [isSubmittingReply, setIsSubmittingReply] = useState(false);
  const [deletingMessageGuid, setDeletingMessageGuid] = useState<string | null>(null);
  const [collapsedInlineCommentGuids, setCollapsedInlineCommentGuids] =
    useState<Set<string>>(() => new Set());
  const [highlightedInlineCommentGuid, setHighlightedInlineCommentGuid] =
    useState<string | null>(null);
  const [highlightedInlineMessageGuid, setHighlightedInlineMessageGuid] =
    useState<string | null>(null);

  const codeViewRef = useRef<CodeViewHandle<ReviewAnnotationMeta>>(null);
  const itemIdsRef = useRef<string[]>([]);
  const pendingAppendRef = useRef<CodeViewItem<ReviewAnnotationMeta>[]>([]);
  const scrollActiveIdRef = useRef<string | null>(null);
  const pathByFileNameRef = useRef<Map<string, string>>(new Map());
  const loadedContentsRef = useRef<
    Map<string, { oldContent: string; newContent: string }>
  >(new Map());
  const fileSnapshotByPathRef = useRef<Map<string, ReviewFileDto>>(new Map());
  const lastHandledNavRef = useRef<string | null>(null);
  const inlineCommentTextareaRef = useRef<HTMLTextAreaElement>(null);
  const loadErrorRef = useRef<Error | null>(null);

  const orderedFiles = useMemo(
    () =>
      sortByDiffTreePath(
        (reviewCtx.currentRevision?.files ?? []).map((file) => ({
          path: file.snapshot.file_path,
          file,
        })),
      ).map((entry) => entry.file),
    [reviewCtx.currentRevision?.files],
  );

  const treeItems = useMemo(
    () =>
      orderedFiles.map((file) => ({
        path: file.snapshot.file_path,
        gitStatus: file.snapshot.git_status,
        additions: file.additions,
        deletions: file.deletions,
      })),
    [orderedFiles],
  );

  const totalStats = useMemo(
    () => ({
      additions: orderedFiles.reduce((sum, file) => sum + file.additions, 0),
      deletions: orderedFiles.reduce((sum, file) => sum + file.deletions, 0),
    }),
    [orderedFiles],
  );

  const revisionLabel = useMemo(() => {
    if (!reviewCtx.currentSession || !reviewCtx.currentRevision) return 'Review';
    const sorted = [...reviewCtx.currentSession.revisions].sort((a, b) =>
      a.created_at.localeCompare(b.created_at),
    );
    const index = sorted.findIndex((r) => r.guid === reviewCtx.currentRevision?.guid);
    return index >= 0 ? `Review v${index + 1}` : 'Review';
  }, [reviewCtx.currentRevision, reviewCtx.currentSession]);

  const renderHeaderPrefix = useMemo(
    () =>
      createDiffHeaderPrefixRenderer({
        viewerRef: codeViewRef,
        pathByFileName: pathByFileNameRef.current,
      }),
    [viewerMounted, viewerKey],
  );

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

  useEffect(() => {
    let cancelled = false;
    setViewerKey((key) => key + 1);
    setViewerMounted(false);
    setInitialItems([]);
    setHasLoadedAllItems(false);
    pendingAppendRef.current = [];
    pathByFileNameRef.current = new Map();
    loadedContentsRef.current = new Map();
    fileSnapshotByPathRef.current = new Map();
    itemIdsRef.current = [];
    scrollActiveIdRef.current = null;
    lastHandledNavRef.current = null;
    loadErrorRef.current = null;

    if (!reviewCtx.currentRevision) {
      setIsLoading(false);
      return () => {
        cancelled = true;
      };
    }

    const load = async () => {
      setIsLoading(true);
      setError(null);

      try {
        let hasPublishedInitial = false;

        for (
          let offset = 0;
          offset < orderedFiles.length;
          offset += CODE_VIEW_BATCH_SIZE
        ) {
          if (cancelled) return;

          const batch = orderedFiles.slice(offset, offset + CODE_VIEW_BATCH_SIZE);
          const results = await Promise.all(
            batch.map(async (file) => {
              try {
                const diff = await reviewWsApi.getFileContent(file.snapshot.guid);
                const fileDiff = parseDiffFromFile(
                  {
                    name: file.snapshot.file_path,
                    contents: diff.old_content,
                  },
                  {
                    name: file.snapshot.file_path,
                    contents: diff.new_content,
                  },
                );
                pathByFileNameRef.current.set(fileDiff.name, file.snapshot.file_path);
                fileSnapshotByPathRef.current.set(file.snapshot.file_path, file);
                loadedContentsRef.current.set(file.snapshot.file_path, {
                  oldContent: diff.old_content,
                  newContent: diff.new_content,
                });
                return {
                  id: file.snapshot.file_path,
                  type: 'diff' as const,
                  fileDiff,
                  collapsed: collapseMode === 'collapsed',
                };
              } catch (loadError) {
                console.error(
                  `Failed to load review diff for ${file.snapshot.file_path}:`,
                  loadError,
                );
                if (loadErrorRef.current == null) {
                  loadErrorRef.current =
                    loadError instanceof Error
                      ? loadError
                      : new Error('Failed to load review diff');
                }
                return null;
              }
            }),
          );

          if (cancelled) return;

          const codeItems: CodeViewItem<ReviewAnnotationMeta>[] = [];
          for (const item of results) {
            if (!item) continue;
            codeItems.push(item);
          }
          if (codeItems.length === 0) continue;

          if (!hasPublishedInitial) {
            hasPublishedInitial = true;
            itemIdsRef.current = codeItems.map((item) => item.id);
            setInitialItems(codeItems);
            setAnnotationVersion((value) => value + 1);
            setIsLoading(false);
            await yieldToBrowser();
          } else {
            itemIdsRef.current = [
              ...itemIdsRef.current,
              ...codeItems.map((item) => item.id),
            ];
            const viewer = codeViewRef.current;
            if (viewer) {
              viewer.addItems(codeItems);
              setAnnotationVersion((value) => value + 1);
              await yieldToBrowser();
            } else {
              pendingAppendRef.current.push(...codeItems);
            }
          }
        }

        if (!cancelled) {
          setHasLoadedAllItems(true);
          if (!hasPublishedInitial && loadErrorRef.current) {
            setError(loadErrorRef.current.message);
          }
          setIsLoading(false);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : 'Failed to load review changes',
          );
          setInitialItems([]);
          setIsLoading(false);
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [collapseMode, orderedFiles, reviewCtx.currentRevision]);

  useEffect(() => {
    if (!viewerMounted || pendingAppendRef.current.length === 0) return;
    const pending = pendingAppendRef.current;
    pendingAppendRef.current = [];
    codeViewRef.current?.addItems(pending);
    setAnnotationVersion((value) => value + 1);
  }, [initialItems, viewerMounted]);

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

  useEffect(() => {
    const commentsByPath = new Map<string, ReviewCommentDto[]>();
    for (const comment of reviewCtx.comments) {
      const file = reviewCtx.currentRevision?.files.find(
        (entry) => entry.snapshot.guid === comment.file_snapshot_guid,
      );
      const filePath = file?.snapshot.file_path ?? comment.anchor.file_path;
      if (!filePath) continue;
      const list = commentsByPath.get(filePath) ?? [];
      list.push(comment);
      commentsByPath.set(filePath, list);
    }

    for (const itemId of itemIdsRef.current) {
      updateViewerDiffItem(codeViewRef.current, itemId, (item) => {
        const commentAnnotations: DiffLineAnnotation<ReviewAnnotationMeta>[] = (
          commentsByPath.get(itemId) ?? []
        ).map((comment) => ({
          side: comment.anchor_side === 'old' ? 'deletions' : 'additions',
          lineNumber: comment.anchor_start_line,
          metadata: {
            kind: 'comment',
            comment,
          },
        }));

        const composerAnnotation =
          inlineCommentDraft?.itemId === itemId
            ? [
                {
                  side:
                    inlineCommentDraft.diffSide === 'old'
                      ? 'deletions'
                      : 'additions',
                  lineNumber: inlineCommentDraft.startLine,
                  metadata: { kind: 'composer' as const },
                } satisfies DiffLineAnnotation<ReviewAnnotationMeta>,
              ]
            : [];

        item.annotations = [...commentAnnotations, ...composerAnnotation];
        item.version = getNextItemVersion(item);
        return true;
      });
    }
  }, [
    annotationVersion,
    inlineCommentDraft,
    reviewCtx.comments,
    reviewCtx.currentRevision?.files,
    viewerMounted,
  ]);

  const openInlineCommentDraft = useCallback(
    (itemId: string, range: SelectedLineRange) => {
      if (!reviewCtx.canEdit) return;
      const viewer = codeViewRef.current;
      const item = viewer?.getItem(itemId);
      const contents = loadedContentsRef.current.get(itemId);
      const file = fileSnapshotByPathRef.current.get(itemId);
      if (item?.type !== 'diff' || !contents || !file) return;

      const selectionInfo = buildDiffSelectionInfo({
        filePath: itemId,
        fileDiff: item.fileDiff,
        contents,
        range,
      });
      if (!selectionInfo) return;

      setInlineCommentBody('');
      setInlineCommentDraft({
        itemId,
        filePath: itemId,
        fileSnapshotGuid: file.snapshot.guid,
        diffSide: selectionInfo.diffSide === 'old' ? 'old' : 'new',
        startLine: selectionInfo.startLine,
        endLine: selectionInfo.endLine,
        selectedText: selectionInfo.selectedText,
        beforeContext: selectionInfo.beforeText
          ? selectionInfo.beforeText.split('\n')
          : [],
        afterContext: selectionInfo.afterText ? selectionInfo.afterText.split('\n') : [],
      });
    },
    [reviewCtx.canEdit],
  );

  const handleInlineCommentSubmit = useCallback(async () => {
    if (!reviewCtx.currentSession || !reviewCtx.currentRevision || !inlineCommentDraft) {
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
        sessionGuid: reviewCtx.currentSession.guid,
        revisionGuid: reviewCtx.currentRevision.guid,
        fileSnapshotGuid: inlineCommentDraft.fileSnapshotGuid,
        anchor: {
          file_path: inlineCommentDraft.filePath,
          side: inlineCommentDraft.diffSide,
          start_line: inlineCommentDraft.startLine,
          end_line: inlineCommentDraft.endLine,
          line_range_kind:
            inlineCommentDraft.startLine === inlineCommentDraft.endLine
              ? 'single'
              : 'range',
          selected_text: inlineCommentDraft.selectedText,
          before_context: inlineCommentDraft.beforeContext,
          after_context: inlineCommentDraft.afterContext,
          hunk_header: null,
        },
        body,
      });
      setInlineCommentBody('');
      setInlineCommentDraft(null);
    } catch (submitError) {
      toastManager.add({
        title: 'Failed to create review comment',
        description:
          submitError instanceof Error
            ? submitError.message
            : 'Unknown review comment error',
        type: 'error',
      });
    } finally {
      setIsSubmittingInlineComment(false);
    }
  }, [
    inlineCommentBody,
    inlineCommentDraft,
    reviewCtx.currentRevision,
    reviewCtx.currentSession,
  ]);

  const handleCommentReplySubmit = useCallback(
    async (comment: ReviewCommentDto) => {
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
        await reviewCtx.handleReplyToComment(comment, body);
        setReplyBody('');
        setReplyDraftCommentGuid(null);
      } catch {
        // Shared review hook already reports failures.
      } finally {
        setIsSubmittingReply(false);
      }
    },
    [replyBody, reviewCtx],
  );

  const handleDeleteMessage = useCallback(
    async (comment: ReviewCommentDto, message: ReviewMessageDto) => {
      setDeletingMessageGuid(message.guid);
      try {
        await reviewCtx.handleDeleteMessage(comment, message);
      } catch {
        // Shared review hook already reports failures.
      } finally {
        setDeletingMessageGuid(null);
      }
    },
    [reviewCtx],
  );

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

  const renderAnnotation = useCallback(
    (annotation: DiffLineAnnotation<ReviewAnnotationMeta>) => {
      if (annotation.metadata?.kind === 'composer') {
        if (!inlineCommentDraft) return null;
        return (
          <div className="mx-3 my-2 rounded-lg border border-primary/20 bg-background/95 p-3 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-foreground">
                  Comment on{' '}
                  {inlineCommentDraft.startLine === inlineCommentDraft.endLine
                    ? `L${inlineCommentDraft.startLine}`
                    : `L${inlineCommentDraft.startLine}-L${inlineCommentDraft.endLine}`}
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
              ref={inlineCommentTextareaRef}
              value={inlineCommentBody}
              onChange={(event) => setInlineCommentBody(event.target.value)}
              onKeyDown={(event) => {
                if (
                  event.key === 'Enter' &&
                  (event.metaKey || event.ctrlKey) &&
                  inlineCommentBody.trim() &&
                  !isSubmittingInlineComment
                ) {
                  event.preventDefault();
                  void handleInlineCommentSubmit();
                }
              }}
              placeholder="Describe the issue or expected change..."
              className="mt-3 min-h-24 bg-background"
            />
            <div className="mt-3 flex items-center gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    onClick={() => void handleInlineCommentSubmit()}
                    disabled={isSubmittingInlineComment}
                  >
                    {isSubmittingInlineComment ? (
                      <Loader2 className="mr-2 size-4 animate-spin" />
                    ) : null}
                    Add Comment
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <div className="flex items-center gap-2">
                    <span>Add comment</span>
                    <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border border-border bg-muted px-1.5 font-mono text-[10px] font-medium text-foreground/90">
                      <Command className="size-3" />
                      <CornerDownLeft className="size-3" />
                    </kbd>
                  </div>
                </TooltipContent>
              </Tooltip>
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

      const comment = annotation.metadata?.comment;
      if (!comment) return null;
      const expanded =
        !collapsedInlineCommentGuids.has(comment.guid) ||
        replyDraftCommentGuid === comment.guid;
      const title =
        comment.title?.trim() ||
        `Comment on L${comment.anchor_start_line}${
          comment.anchor_start_line === comment.anchor_end_line
            ? ''
            : `-${comment.anchor_end_line}`
        }`;

      return (
        <div
          className={cn(
            'mx-3 my-2 rounded-lg border p-3 shadow-sm',
            comment.status === 'fixed'
              ? 'border-emerald-500/25 bg-emerald-500/5'
              : comment.status === 'agent_fixed'
                ? 'border-amber-500/25 bg-amber-500/5'
                : comment.status === 'dismissed'
                  ? 'border-muted-foreground/15 bg-muted/30'
                  : 'border-blue-500/25 bg-blue-500/5',
            highlightedInlineCommentGuid === comment.guid &&
              'animate-pulse ring-2 ring-primary/60 ring-offset-2 ring-offset-background',
          )}
          data-review-comment-guid={comment.guid}
          data-review-anchor-line={comment.anchor_start_line}
        >
          <button
            type="button"
            onClick={() => toggleInlineCommentExpanded(comment.guid)}
            className="grid w-full cursor-pointer grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 text-left"
            aria-label={expanded ? 'Collapse comment' : 'Expand comment'}
          >
            <ChevronRight
              className={cn(
                'size-3.5 shrink-0 text-muted-foreground transition-transform',
                expanded && 'rotate-90',
              )}
            />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">{title}</p>
            </div>
            <span
              className={cn(
                'shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium',
                statusTone(comment.status),
              )}
            >
              {reviewCommentStatusLabel(comment.status)}
            </span>
          </button>

          {expanded ? (
            <>
              <div className="mt-3 space-y-2">
                {comment.messages.map((message) => (
                  <div
                    key={message.guid}
                    data-review-message-guid={message.guid}
                    className={cn(
                      'group/message rounded-md',
                      highlightedInlineMessageGuid === message.guid &&
                        'animate-pulse ring-2 ring-primary/60 ring-offset-2 ring-offset-background',
                    )}
                  >
                    <MessageBubble
                      message={message}
                      onEdit={reviewCtx.handleUpdateMessage}
                      action={
                        reviewCtx.canEdit
                          ? ({ startEdit }) => (
                              <ReviewMessageActionsMenu
                                message={message}
                                disabled={deletingMessageGuid === message.guid}
                                onEdit={startEdit}
                                onDelete={() => void handleDeleteMessage(comment, message)}
                              />
                            )
                          : undefined
                      }
                    />
                  </div>
                ))}
              </div>

              <div className="mt-3 flex items-center gap-2">
                {reviewCtx.canEdit ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setReplyDraftCommentGuid((current) =>
                        current === comment.guid ? null : comment.guid,
                      )
                    }
                  >
                    Reply
                  </Button>
                ) : null}
                {reviewCtx.canEdit ? (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        void reviewCtx.handleUpdateCommentStatus(
                          comment.guid,
                          comment.status === 'open' ? 'fixed' : 'open',
                        )
                      }
                    >
                      {comment.status === 'open' ? 'Mark Fixed' : 'Reopen'}
                    </Button>
                    {comment.status !== 'dismissed' ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          void reviewCtx.handleUpdateCommentStatus(
                            comment.guid,
                            'dismissed',
                          )
                        }
                      >
                        Dismiss
                      </Button>
                    ) : null}
                  </>
                ) : null}
              </div>

              {replyDraftCommentGuid === comment.guid ? (
                <div className="mt-3 rounded-md border border-border/60 bg-background/80 p-3">
                  <Textarea
                    value={replyBody}
                    onChange={(event) => setReplyBody(event.target.value)}
                    placeholder="Write a reply..."
                    className="min-h-20 bg-background"
                  />
                  <div className="mt-3 flex items-center gap-2">
                    <Button
                      size="sm"
                      onClick={() => void handleCommentReplySubmit(comment)}
                      disabled={isSubmittingReply}
                    >
                      {isSubmittingReply ? (
                        <Loader2 className="mr-2 size-4 animate-spin" />
                      ) : null}
                      Send Reply
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setReplyDraftCommentGuid(null);
                        setReplyBody('');
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      );
    },
    [
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
      reviewCtx,
      toggleInlineCommentExpanded,
    ],
  );

  const codeViewOptions = useMemo(
    () => ({
      ...buildSharedDiffViewOptions({
        theme: ATMOS_DIFF_THEME,
        diffStyle,
        wordWrap,
        disableBackground: !showBackgrounds,
        lineNumbers,
        diffIndicators,
        enableLineSelection: reviewCtx.canEdit,
        enableGutterUtility: reviewCtx.canEdit,
      }),
      onLineSelectionEnd(
        range: SelectedLineRange | null,
        context: { item: CodeViewItem<ReviewAnnotationMeta> },
      ) {
        if (!range || context.item.type !== 'diff') return;
        openInlineCommentDraft(context.item.id, range);
      },
      onGutterUtilityClick(
        range: SelectedLineRange,
        context: { item: CodeViewItem<ReviewAnnotationMeta> },
      ) {
        if (context.item.type !== 'diff') return;
        openInlineCommentDraft(context.item.id, range);
      },
      gutterUtilityAriaLabel: reviewCtx.canEdit ? 'Add review comment' : undefined,
    }),
    [
      diffIndicators,
      diffStyle,
      lineNumbers,
      openInlineCommentDraft,
      reviewCtx.canEdit,
      showBackgrounds,
      wordWrap,
    ],
  );

  const handleViewerRef = useCallback(
    (handle: CodeViewHandle<ReviewAnnotationMeta> | null) => {
      codeViewRef.current = handle;
      setViewerMounted(handle != null);
    },
    [],
  );

  const handleToggleCollapseMode = useCallback(() => {
    const viewer = codeViewRef.current;
    if (!viewer) return;
    const next = collapseMode === 'expanded' ? 'collapsed' : 'expanded';
    setCollapseMode(next);

    for (const itemId of itemIdsRef.current) {
      updateViewerDiffItem(viewer, itemId, (item) => {
        item.collapsed = next === 'collapsed';
        return true;
      });
    }
  }, [collapseMode]);

  useEffect(() => {
    const instance = codeViewRef.current?.getInstance();
    if (!instance || !effectiveContextId) return;

    return instance.subscribeToScroll((_scrollTop, viewer) => {
      if (itemIdsRef.current.length === 0) return;
      const activeId = findDiffItemIdForViewport(viewer, itemIdsRef.current);
      if (!activeId || activeId === scrollActiveIdRef.current) return;
      scrollActiveIdRef.current = activeId;
      setDiffGroupActiveFile(groupPath, activeId, effectiveContextId);
    });
  }, [effectiveContextId, groupPath, setDiffGroupActiveFile, viewerKey, viewerMounted]);

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
    const targetPath = navigationTarget.diffFilePath;
    if (!itemIdsRef.current.includes(targetPath)) return;
    if (lastHandledNavRef.current === navigationScrollKey) return;

    if (navigationTarget.reviewCommentGuid) {
      setCollapsedInlineCommentGuids((prev) => {
        if (!prev.has(navigationTarget.reviewCommentGuid!)) return prev;
        const next = new Set(prev);
        next.delete(navigationTarget.reviewCommentGuid!);
        return next;
      });
      if (navigationTarget.reviewMessageGuid) {
        setHighlightedInlineMessageGuid(navigationTarget.reviewMessageGuid);
      } else {
        setHighlightedInlineCommentGuid(navigationTarget.reviewCommentGuid);
      }
    }

    if (effectiveContextId) {
      setDiffGroupActiveFile(groupPath, targetPath, effectiveContextId);
    }

    requestAnimationFrame(() => {
      if (!codeViewRef.current?.getItem(targetPath)) {
        return;
      }
      lastHandledNavRef.current = navigationScrollKey;
      scrollCodeViewToItem(codeViewRef.current, targetPath, {
        line: navigationTarget.line,
        behavior: 'smooth',
      });
      if (effectiveContextId) {
        clearNavigationTarget(groupPath, effectiveContextId);
      }
    });
  }, [
    annotationVersion,
    clearNavigationTarget,
    effectiveContextId,
    groupPath,
    isLoading,
    navigationScrollKey,
    navigationTarget,
    setDiffGroupActiveFile,
    viewerMounted,
  ]);

  const handleSelectFile = useCallback(
    (path: string) => {
      if (effectiveContextId) {
        setDiffGroupActiveFile(groupPath, path, effectiveContextId);
      }
      scrollCodeViewToItem(codeViewRef.current, path, { behavior: 'smooth' });
    },
    [effectiveContextId, groupPath, setDiffGroupActiveFile],
  );

  const toolbar = (
    <div className="flex items-center gap-2">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span className="truncate text-sm font-medium text-foreground">
          {revisionLabel}
        </span>
        <span className="shrink-0 text-xs text-muted-foreground">
          {treeItems.length} file{treeItems.length === 1 ? '' : 's'}
        </span>
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

  if (!reviewCtx.currentSession || !reviewCtx.currentRevision) {
    return (
      <div className="flex h-full items-center justify-center bg-background text-sm text-muted-foreground">
        No review revision selected
      </div>
    );
  }

  if (isLoading || !workerPoolReady) {
    return (
      <div className="flex h-full flex-col overflow-hidden bg-background">
        <DiffCodeViewScaffold
          items={treeItems}
          selectedPath={selectedPath}
          ariaLabel="Review files"
          loading
          loadingTreeLabel={revisionLabel}
          defaultTreeVisible={false}
          toolbar={
            <div className="flex items-center gap-2">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <span className="truncate text-sm font-medium text-foreground">
                  {revisionLabel}
                </span>
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
          <p className="mb-2 text-red-500">Error loading review diff</p>
          <p className="text-sm text-muted-foreground">{error}</p>
        </div>
      </div>
    );
  }

  if (initialItems.length === 0) {
    return (
      <div className="flex h-full items-center justify-center bg-background text-sm text-muted-foreground">
        No files in this revision
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      <DiffCodeViewScaffold
        items={treeItems}
        selectedPath={selectedPath}
        ariaLabel="Review files"
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
