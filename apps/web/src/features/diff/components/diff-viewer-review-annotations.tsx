'use client';

import type { RefObject } from 'react';
import { useTranslations } from 'next-intl';
import type { DiffLineAnnotation } from '@pierre/diffs';
import type { ReviewCommentDto, ReviewMessageDto } from '@/api/ws-api';
import { MessageBubble } from '@/features/diff/components/review/MessageBubble';
import { ReviewMessageActionsMenu } from '@/features/diff/components/review/ReviewMessageActionsMenu';
import {
  statusTone,
} from '@/features/diff/components/review/utils';
import { cn } from '@/shared/lib/utils';
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
  const t = useTranslations('diff.reviewAnnotations');
  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'open':
        return t('status.open');
      case 'agent_fixed':
        return t('status.agentFixed');
      case 'fixed':
        return t('status.fixed');
      case 'dismissed':
        return t('status.dismissed');
      default:
        return status.replaceAll('_', ' ');
    }
  };
  if (annotation.metadata?.kind === 'composer') {
    if (!inlineCommentDraft) return null;
    return (
      <div className="mx-3 my-2 rounded-md border border-border/70 bg-popover/95 p-3 font-sans shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-0.5">
            <p className="text-sm font-medium leading-5 text-foreground">
              {inlineCommentDraft.startLine === inlineCommentDraft.endLine
                ? t('composer.titleSingle', { line: inlineCommentDraft.startLine })
                : t('composer.titleRange', {
                    startLine: inlineCommentDraft.startLine,
                    endLine: inlineCommentDraft.endLine,
                  })}
            </p>
            <p className="text-xs leading-4 text-muted-foreground">
              {t('composer.description')}
            </p>
          </div>
          <button
            type="button"
            className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={onInlineCommentCancel}
            aria-label={t('composer.cancelCommentAria')}
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
          placeholder={t('composer.placeholder')}
          className="mt-3 min-h-20 resize-y rounded-md border-border/70 bg-muted/20 font-sans text-sm leading-5 focus:bg-background"
        />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                className="h-8 rounded-md px-2.5 text-xs font-medium"
                onClick={onInlineCommentSubmit}
                disabled={isSubmittingInlineComment}
              >
                {isSubmittingInlineComment ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                {t('composer.actions.addComment')}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <div className="flex items-center gap-2">
                <span>{t('composer.tooltips.addComment')}</span>
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
              className="h-8 rounded-md px-2.5 text-xs font-medium"
              onClick={onInlineCommentCancel}
            >
              {t('composer.actions.cancel')}
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
    (comment.anchor_start_line === comment.anchor_end_line
      ? t('comment.titleSingle', { line: comment.anchor_start_line })
      : t('comment.titleRange', {
          startLine: comment.anchor_start_line,
          endLine: comment.anchor_end_line,
        }));
  return (
    <div className={cn(
      'mx-3 my-2 rounded-md border p-3 font-sans shadow-sm',
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
        className="grid w-full cursor-pointer grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 text-left font-sans"
        aria-label={expanded ? t('comment.collapseAria') : t('comment.expandAria')}
      >
        <ChevronRight
          className={cn(
            'size-3.5 shrink-0 text-muted-foreground transition-transform',
            expanded && 'rotate-90',
          )}
        />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium leading-5 text-foreground">
            {title}
          </p>
        </div>
        <span
          className={cn(
            'shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium',
            statusTone(comment.status),
          )}
        >
          {getStatusLabel(comment.status)}
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
            <div className="mt-3 rounded-md border border-border/70 bg-muted/20 p-3">
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
                placeholder={t('reply.placeholder')}
                className="min-h-20 rounded-md border-border/70 bg-background font-sans text-sm leading-5"
                autoFocus
              />
              <div className="mt-3 flex flex-wrap justify-end gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 rounded-md px-2.5 text-xs font-medium"
                  disabled={isSubmittingReply}
                  onClick={onReplyCancel}
                >
                  <X className="mr-1.5 size-3.5" />
                  {t('reply.actions.cancel')}
                </Button>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="sm"
                      className="h-8 rounded-md px-2.5 text-xs font-medium"
                      disabled={!replyBody.trim() || isSubmittingReply}
                      onClick={() => onReplySubmit(comment)}
                    >
                      <SendHorizontal className="mr-1.5 size-3.5" />
                      {t('reply.actions.reply')}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <div className="flex items-center gap-2">
                      <span>{t('reply.tooltips.sendReply')}</span>
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
                className="h-8 rounded-md px-2.5 text-xs font-medium"
                onClick={() => onToggleReplyDraft(comment.guid)}
              >
                <MessageSquareReply className="mr-1.5 size-3.5" />
                {t('reply.actions.reply')}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
