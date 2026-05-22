'use client';

import type { RefObject } from 'react';
import type { DiffLineAnnotation } from '@pierre/diffs';
import type { ReviewCommentDto, ReviewMessageDto } from '@/api/ws-api';
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
} from '@workspace/ui';
import {
  ChevronRight,
  Command,
  CornerDownLeft,
  MessageSquareReply,
  SendHorizontal,
  X,
} from 'lucide-react';

export interface DiffViewerInlineCommentDraft {
  side: 'old' | 'new';
  startLine: number;
  endLine: number;
  selectedText: string;
  beforeContext: string[];
  afterContext: string[];
  diffSide: 'old' | 'new';
}

export type DiffViewerAnnotationMeta =
  | {
      kind: 'comment';
      comment: ReviewCommentDto;
    }
  | {
      kind: 'composer';
    };

interface DiffViewerReviewAnnotationProps {
  annotation: DiffLineAnnotation<DiffViewerAnnotationMeta>;
  inlineCommentDraft: DiffViewerInlineCommentDraft | null;
  inlineCommentTextareaRef: RefObject<HTMLTextAreaElement | null>;
  inlineCommentBody: string;
  isSubmittingInlineComment: boolean;
  replyBody: string;
  replyDraftCommentGuid: string | null;
  isSubmittingReply: boolean;
  deletingMessageGuid: string | null;
  collapsedInlineCommentGuids: Set<string>;
  highlightedInlineCommentGuid: string | null;
  highlightedInlineMessageGuid: string | null;
  canEditReview: boolean;
  onInlineCommentBodyChange: (body: string) => void;
  onInlineCommentSubmit: () => void;
  onInlineCommentCancel: () => void;
  onReplyBodyChange: (body: string) => void;
  onReplySubmit: (comment: ReviewCommentDto) => void;
  onReplyCancel: () => void;
  onToggleReplyDraft: (commentGuid: string) => void;
  onToggleInlineCommentExpanded: (commentGuid: string) => void;
  onUpdateMessage: (message: ReviewMessageDto, body: string) => Promise<void>;
  onDeleteMessage: (
    comment: ReviewCommentDto,
    message: ReviewMessageDto,
  ) => void;
}

export function DiffViewerReviewAnnotation({
  annotation,
  inlineCommentDraft,
  inlineCommentTextareaRef,
  inlineCommentBody,
  isSubmittingInlineComment,
  replyBody,
  replyDraftCommentGuid,
  isSubmittingReply,
  deletingMessageGuid,
  collapsedInlineCommentGuids,
  highlightedInlineCommentGuid,
  highlightedInlineMessageGuid,
  canEditReview,
  onInlineCommentBodyChange,
  onInlineCommentSubmit,
  onInlineCommentCancel,
  onReplyBodyChange,
  onReplySubmit,
  onReplyCancel,
  onToggleReplyDraft,
  onToggleInlineCommentExpanded,
  onUpdateMessage,
  onDeleteMessage,
}: DiffViewerReviewAnnotationProps) {
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
            onClick={onInlineCommentCancel}
            aria-label="Cancel comment"
          >
            <X className="size-4" />
          </button>
        </div>
        <Textarea
          ref={inlineCommentTextareaRef}
          value={inlineCommentBody}
          onChange={(event) => onInlineCommentBodyChange(event.target.value)}
          onKeyDown={(event) => {
            if (
              event.key === 'Enter' &&
              (event.metaKey || event.ctrlKey) &&
              inlineCommentBody.trim() &&
              !isSubmittingInlineComment
            ) {
              event.preventDefault();
              onInlineCommentSubmit();
            }
          }}
          placeholder="Describe the issue or expected change..."
          className="mt-3 min-h-24 bg-background"
        />
        <div className="mt-3 flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="sm" onClick={onInlineCommentSubmit} disabled={isSubmittingInlineComment}>
                {isSubmittingInlineComment ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
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
            onClick={onInlineCommentCancel}
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
    <div className={cn(
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
        onClick={() => onToggleInlineCommentExpanded(comment.guid)}
        className="grid w-full cursor-pointer grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 text-left"
        aria-label={expanded ? "Collapse comment" : "Expand comment"}
      >
        <ChevronRight
          className={cn(
            'size-3.5 shrink-0 text-muted-foreground transition-transform',
            expanded && 'rotate-90',
          )}
        />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">
            {title}
          </p>
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

      {expanded && (
        <>
          <div className="mt-3 space-y-2">
            {comment.messages.map((message) => (
              <div
                key={message.guid}
                data-review-message-guid={message.guid}
                className={cn(
                  "group/message rounded-md",
                  highlightedInlineMessageGuid === message.guid &&
                    "animate-pulse ring-2 ring-primary/60 ring-offset-2 ring-offset-background",
                )}
              >
                <MessageBubble
                  message={message}
                  onEdit={onUpdateMessage}
                  action={
                    canEditReview ? (
                      ({ startEdit }) => (
                        <ReviewMessageActionsMenu
                          message={message}
                          disabled={deletingMessageGuid === message.guid}
                          onEdit={startEdit}
                          onDelete={() => onDeleteMessage(comment, message)}
                        />
                      )
                    ) : null
                  }
                />
              </div>
            ))}
          </div>
          {canEditReview && replyDraftCommentGuid === comment.guid && (
            <div className="mt-3 rounded-md border border-border bg-background p-2">
              <Textarea
                value={replyBody}
                onChange={(event) => onReplyBodyChange(event.target.value)}
                onKeyDown={(event) => {
                  if (
                    event.key === 'Enter' &&
                    (event.metaKey || event.ctrlKey) &&
                    replyBody.trim() &&
                    !isSubmittingReply
                  ) {
                    event.preventDefault();
                    onReplySubmit(comment);
                  }
                }}
                placeholder="Reply to this comment..."
                className="min-h-20 bg-background text-sm"
                autoFocus
              />
              <div className="mt-2 flex justify-end gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={isSubmittingReply}
                  onClick={onReplyCancel}
                >
                  <X className="mr-1.5 size-3.5" />
                  Cancel
                </Button>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="sm"
                      disabled={!replyBody.trim() || isSubmittingReply}
                      onClick={() => onReplySubmit(comment)}
                    >
                      <SendHorizontal className="mr-1.5 size-3.5" />
                      Reply
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <div className="flex items-center gap-2">
                      <span>Send reply</span>
                      <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border border-border bg-muted px-1.5 font-mono text-[10px] font-medium text-foreground/90">
                        <Command className="size-3" />
                        <CornerDownLeft className="size-3" />
                      </kbd>
                    </div>
                  </TooltipContent>
                </Tooltip>
              </div>
            </div>
          )}
          {canEditReview && (
            <div className="mt-3">
              <Button
                size="sm"
                variant="outline"
                onClick={() => onToggleReplyDraft(comment.guid)}
              >
                <MessageSquareReply className="mr-1.5 size-3.5" />
                Reply
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
