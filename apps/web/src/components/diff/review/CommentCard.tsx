"use client";

import React, { useState } from "react";
import {
  Button,
  Textarea,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@workspace/ui";
import { cn } from "@/lib/utils";
import { MessageBubble } from "./MessageBubble";
import {
  reviewCommentStatusLabel,
  canDeleteReviewMessage,
  statusTone,
  commentTitle,
} from "./utils";
import {
  CheckCircle2,
  ChevronRight,
  Command,
  CornerDownLeft,
  MessageSquareReply,
  RotateCcw,
  SendHorizontal,
  Trash2,
  X,
  XCircle,
} from "lucide-react";
import type { ReviewMessageDto, ReviewCommentDto } from "@/api/ws-api";

interface CommentCardProps {
  comment: ReviewCommentDto;
  canEdit: boolean;
  onUpdateStatus: (commentGuid: string, status: string) => void | Promise<void>;
  onReply: (comment: ReviewCommentDto, body: string) => void | Promise<void>;
  onDeleteMessage?: (comment: ReviewCommentDto, message: ReviewMessageDto) => void | Promise<void>;
  onNavigate?: (comment: ReviewCommentDto, message?: ReviewMessageDto) => void;
}

export const CommentCard: React.FC<CommentCardProps> = ({
  comment,
  canEdit,
  onUpdateStatus,
  onReply,
  onDeleteMessage,
  onNavigate,
}) => {
  const [expanded, setExpanded] = useState(true);
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyBody, setReplyBody] = useState("");
  const [isSubmittingReply, setIsSubmittingReply] = useState(false);
  const [deletingMessageGuid, setDeletingMessageGuid] = useState<string | null>(null);

  const handleSubmitReply = async () => {
    const body = replyBody.trim();
    if (!body) return;
    setIsSubmittingReply(true);
    try {
      await onReply(comment, body);
      setReplyBody("");
      setReplyOpen(false);
    } catch {
      // The shared review hook already shows the failure toast.
    } finally {
      setIsSubmittingReply(false);
    }
  };

  const handleDeleteMessage = async (message: ReviewMessageDto) => {
    if (!onDeleteMessage) return;
    setDeletingMessageGuid(message.guid);
    try {
      await onDeleteMessage(comment, message);
    } catch {
      // The shared review hook already shows the failure toast.
    } finally {
      setDeletingMessageGuid(null);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-background/80 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-start gap-2">
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label={expanded ? "Collapse comment" : "Expand comment"}
          >
            <ChevronRight
              className={cn(
                "size-3.5 transition-transform",
                expanded && "rotate-90",
              )}
            />
          </button>
          <button
            type="button"
            onClick={() => onNavigate?.(comment)}
            className="min-w-0 flex-1 cursor-pointer text-left"
          >
            <p className="truncate text-sm font-medium text-foreground">
              {commentTitle(comment)}
            </p>
          </button>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium",
            statusTone(comment.status),
          )}
        >
          {reviewCommentStatusLabel(comment.status)}
        </span>
      </div>

      {expanded && (
        <>
          <div className="mt-3 space-y-2">
            {comment.messages.map((message) => (
              <div
                key={message.guid}
                role="button"
                tabIndex={0}
                onClick={() => onNavigate?.(comment, message)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onNavigate?.(comment, message);
                  }
                }}
                className="group/message block w-full cursor-pointer text-left"
              >
                <MessageBubble
                  message={message}
                  action={
                    canEdit &&
                    onDeleteMessage &&
                    canDeleteReviewMessage(comment, message) ? (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          void handleDeleteMessage(message);
                        }}
                        disabled={deletingMessageGuid === message.guid}
                        className="flex size-6 items-center justify-center rounded text-muted-foreground opacity-0 transition-colors hover:bg-destructive/10 hover:text-destructive group-hover/message:opacity-100 disabled:opacity-50"
                        title="Delete comment"
                        aria-label="Delete comment"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    ) : null
                  }
                />
              </div>
            ))}
          </div>

          {canEdit && replyOpen && (
            <div className="mt-3 rounded-md border border-border bg-background p-2">
              <Textarea
                value={replyBody}
                onChange={(event) => setReplyBody(event.target.value)}
                onKeyDown={(event) => {
                  if (
                    event.key === "Enter" &&
                    (event.metaKey || event.ctrlKey) &&
                    replyBody.trim() &&
                    !isSubmittingReply
                  ) {
                    event.preventDefault();
                    void handleSubmitReply();
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
                  onClick={() => {
                    setReplyOpen(false);
                    setReplyBody("");
                  }}
                >
                  <X className="mr-1.5 size-3.5" />
                  Cancel
                </Button>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="sm"
                      disabled={!replyBody.trim() || isSubmittingReply}
                      onClick={() => void handleSubmitReply()}
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

          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={!canEdit}
              onClick={() => setReplyOpen((value) => !value)}
            >
              <MessageSquareReply className="mr-1.5 size-3.5" />
              Reply
            </Button>
            {comment.status === "open" && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  className="border-emerald-500/40! bg-emerald-500/10! text-emerald-600 hover:bg-emerald-500/20 hover:text-emerald-700"
                  disabled={!canEdit}
                  onClick={() => onUpdateStatus(comment.guid, "fixed")}
                >
                  <CheckCircle2 className="mr-1.5 size-3.5" />
                  Mark Fixed
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="border-muted-foreground/30! bg-muted! text-muted-foreground hover:bg-muted/80 hover:text-foreground"
                  disabled={!canEdit}
                  onClick={() => onUpdateStatus(comment.guid, "dismissed")}
                >
                  <XCircle className="mr-1.5 size-3.5" />
                  Dismiss
                </Button>
              </>
            )}
            {comment.status === "agent_fixed" && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  className="border-emerald-500/40! bg-emerald-500/10! text-emerald-600 hover:bg-emerald-500/20 hover:text-emerald-700"
                  disabled={!canEdit}
                  onClick={() => onUpdateStatus(comment.guid, "fixed")}
                >
                  <CheckCircle2 className="mr-1.5 size-3.5" />
                  Mark Fixed
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="border-blue-500/40! bg-blue-500/10! text-blue-600 hover:bg-blue-500/20 hover:text-blue-700"
                  disabled={!canEdit}
                  onClick={() => onUpdateStatus(comment.guid, "open")}
                >
                  <RotateCcw className="mr-1.5 size-3.5" />
                  Reopen
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="border-muted-foreground/30! bg-muted! text-muted-foreground hover:bg-muted/80 hover:text-foreground"
                  disabled={!canEdit}
                  onClick={() => onUpdateStatus(comment.guid, "dismissed")}
                >
                  <XCircle className="mr-1.5 size-3.5" />
                  Dismiss
                </Button>
              </>
            )}
            {comment.status === "fixed" && (
              <Button
                size="sm"
                variant="outline"
                className="border-blue-500/40! bg-blue-500/10! text-blue-600 hover:bg-blue-500/20 hover:text-blue-700"
                disabled={!canEdit}
                onClick={() => onUpdateStatus(comment.guid, "open")}
              >
                <RotateCcw className="mr-1.5 size-3.5" />
                Reopen
              </Button>
            )}
            {comment.status === "dismissed" && (
              <Button
                size="sm"
                variant="outline"
                className="border-blue-500/40! bg-blue-500/10! text-blue-600 hover:bg-blue-500/20 hover:text-blue-700"
                disabled={!canEdit}
                onClick={() => onUpdateStatus(comment.guid, "open")}
              >
                <RotateCcw className="mr-1.5 size-3.5" />
                Reopen
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
};
