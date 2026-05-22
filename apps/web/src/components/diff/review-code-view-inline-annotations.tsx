'use client';

import type { RefObject } from 'react';
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
  X,
} from 'lucide-react';

export type ReviewAnnotationMeta =
  | {
      kind: 'comment';
      comment: ReviewCommentDto;
    }
  | {
      kind: 'composer';
    };

export interface InlineCommentDraft {
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

interface InlineCommentComposerProps {
  draft: InlineCommentDraft;
  body: string;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  isSubmitting: boolean;
  onBodyChange: (body: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}

export function InlineCommentComposer({
  draft,
  body,
  textareaRef,
  isSubmitting,
  onBodyChange,
  onSubmit,
  onCancel,
}: InlineCommentComposerProps) {
  const lineLabel =
    draft.startLine === draft.endLine
      ? `L${draft.startLine}`
      : `L${draft.startLine}-L${draft.endLine}`;

  return (
    <div className="mx-3 my-2 rounded-lg border border-primary/20 bg-background/95 p-3 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-foreground">
            Comment on {lineLabel}
          </p>
          <p className="text-xs text-muted-foreground">
            Add a review comment directly on this diff.
          </p>
        </div>
        <button
          type="button"
          className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          onClick={onCancel}
          aria-label="Cancel comment"
        >
          <X className="size-4" />
        </button>
      </div>
      <Textarea
        ref={textareaRef}
        value={body}
        onChange={(event) => onBodyChange(event.target.value)}
        onKeyDown={(event) => {
          if (
            event.key === 'Enter' &&
            (event.metaKey || event.ctrlKey) &&
            body.trim() &&
            !isSubmitting
          ) {
            event.preventDefault();
            onSubmit();
          }
        }}
        placeholder="Describe the issue or expected change..."
        className="mt-3 min-h-24 bg-background"
      />
      <div className="mt-3 flex items-center gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="sm" onClick={onSubmit} disabled={isSubmitting}>
              {isSubmitting ? (
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
        <Button size="sm" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

interface InlineReviewCommentAnnotationProps {
  comment: ReviewCommentDto;
  expanded: boolean;
  highlightedCommentGuid: string | null;
  highlightedMessageGuid: string | null;
  canEdit: boolean;
  deletingMessageGuid: string | null;
  replyDraftCommentGuid: string | null;
  replyBody: string;
  isSubmittingReply: boolean;
  onToggleExpanded: (commentGuid: string) => void;
  onUpdateMessage: (message: ReviewMessageDto, body: string) => void | Promise<void>;
  onDeleteMessage: (message: ReviewMessageDto) => void | Promise<void>;
  onUpdateCommentStatus: (
    commentGuid: string,
    status: string,
  ) => void | Promise<void>;
  onReplyToggle: (commentGuid: string) => void;
  onReplyBodyChange: (body: string) => void;
  onReplySubmit: () => void;
  onReplyCancel: () => void;
}

export function InlineReviewCommentAnnotation({
  comment,
  expanded,
  highlightedCommentGuid,
  highlightedMessageGuid,
  canEdit,
  deletingMessageGuid,
  replyDraftCommentGuid,
  replyBody,
  isSubmittingReply,
  onToggleExpanded,
  onUpdateMessage,
  onDeleteMessage,
  onUpdateCommentStatus,
  onReplyToggle,
  onReplyBodyChange,
  onReplySubmit,
  onReplyCancel,
}: InlineReviewCommentAnnotationProps) {
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
        highlightedCommentGuid === comment.guid &&
          'animate-pulse ring-2 ring-primary/60 ring-offset-2 ring-offset-background',
      )}
      data-review-comment-guid={comment.guid}
      data-review-anchor-line={comment.anchor_start_line}
    >
      <button
        type="button"
        onClick={() => onToggleExpanded(comment.guid)}
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
                  highlightedMessageGuid === message.guid &&
                    'animate-pulse ring-2 ring-primary/60 ring-offset-2 ring-offset-background',
                )}
              >
                <MessageBubble
                  message={message}
                  onEdit={onUpdateMessage}
                  action={
                    canEdit
                      ? ({ startEdit }) => (
                          <ReviewMessageActionsMenu
                            message={message}
                            disabled={deletingMessageGuid === message.guid}
                            onEdit={startEdit}
                            onDelete={() => void onDeleteMessage(message)}
                          />
                        )
                      : undefined
                  }
                />
              </div>
            ))}
          </div>

          <div className="mt-3 flex items-center gap-2">
            {canEdit ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => onReplyToggle(comment.guid)}
              >
                Reply
              </Button>
            ) : null}
            {canEdit ? (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    void onUpdateCommentStatus(
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
                      void onUpdateCommentStatus(comment.guid, 'dismissed')
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
                onChange={(event) => onReplyBodyChange(event.target.value)}
                placeholder="Write a reply..."
                className="min-h-20 bg-background"
              />
              <div className="mt-3 flex items-center gap-2">
                <Button
                  size="sm"
                  onClick={onReplySubmit}
                  disabled={isSubmittingReply}
                >
                  {isSubmittingReply ? (
                    <Loader2 className="mr-2 size-4 animate-spin" />
                  ) : null}
                  Send Reply
                </Button>
                <Button size="sm" variant="outline" onClick={onReplyCancel}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
