"use client";

import React, { useState } from "react";
import { useTranslations } from "next-intl";
import {
  Button,
  Textarea,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@workspace/ui";
import { cn } from "@/shared/lib/utils";
import { MessageBubble } from "./MessageBubble";
import { ReviewMessageActionsMenu } from "./ReviewMessageActionsMenu";
import {
  statusTone,
} from "./utils";
import {
  CheckCircle2,
  ChevronRight,
  Command,
  CornerDownLeft,
  MessageSquareReply,
  RotateCcw,
  SendHorizontal,
  X,
  XCircle,
} from "lucide-react";
import type { ReviewMessageDto, ReviewCommentDto } from "@/api/ws-api";

interface CommentCardProps {
  comment: ReviewCommentDto;
  canEdit: boolean;
  onUpdateStatus: (commentGuid: string, status: string) => void | Promise<void>;
  onReply: (comment: ReviewCommentDto, body: string) => void | Promise<void>;
  onUpdateMessage?: (message: ReviewMessageDto, body: string) => void | Promise<void>;
  onDeleteMessage?: (comment: ReviewCommentDto, message: ReviewMessageDto) => void | Promise<void>;
  onNavigate?: (comment: ReviewCommentDto, message?: ReviewMessageDto) => void;
}

export const CommentCard: React.FC<CommentCardProps> = ({
  comment,
  canEdit,
  onUpdateStatus,
  onReply,
  onUpdateMessage,
  onDeleteMessage,
  onNavigate,
}) => {
  const t = useTranslations("diff.reviewAnnotations");
  const [expanded, setExpanded] = useState(true);
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyBody, setReplyBody] = useState("");
  const [isSubmittingReply, setIsSubmittingReply] = useState(false);
  const [deletingMessageGuid, setDeletingMessageGuid] = useState<string | null>(null);
  const getStatusLabel = (status: string) => {
    switch (status) {
      case "open":
        return t("status.open");
      case "agent_fixed":
        return t("status.agentFixed");
      case "fixed":
        return t("status.fixed");
      case "dismissed":
        return t("status.dismissed");
      default:
        return status.replaceAll("_", " ");
    }
  };
  const title =
    comment.title?.trim() ||
    (comment.anchor_start_line === comment.anchor_end_line
      ? t("comment.titleSingle", { line: comment.anchor_start_line })
      : t("comment.titleRange", {
          startLine: comment.anchor_start_line,
          endLine: comment.anchor_end_line,
        }));

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
    <div className="rounded-md border border-border/70 bg-popover/80 p-3 font-sans shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-start gap-2">
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label={expanded ? t("comment.collapseAria") : t("comment.expandAria")}
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
            <p className="truncate text-sm font-medium leading-5 text-foreground">
              {title}
            </p>
          </button>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium",
            statusTone(comment.status),
          )}
        >
          {getStatusLabel(comment.status)}
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
                  onEdit={onUpdateMessage}
                  action={
                    canEdit &&
                    onDeleteMessage &&
                    onUpdateMessage ? (
                      ({ startEdit }) => (
                        <ReviewMessageActionsMenu
                          message={message}
                          disabled={deletingMessageGuid === message.guid}
                          onEdit={startEdit}
                          onDelete={() => handleDeleteMessage(message)}
                        />
                      )
                    ) : null
                  }
                />
              </div>
            ))}
          </div>

          {canEdit && replyOpen && (
            <div className="mt-3 rounded-md border border-border/70 bg-muted/20 p-3">
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
                placeholder={t("reply.placeholder")}
                className="min-h-20 rounded-md border-border/70 bg-background font-sans text-sm leading-5"
                autoFocus
              />
              <div className="mt-3 flex flex-wrap justify-end gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 rounded-md px-2.5 text-xs font-medium"
                  disabled={isSubmittingReply}
                  onClick={() => {
                    setReplyOpen(false);
                    setReplyBody("");
                  }}
                >
                  <X className="mr-1.5 size-3.5" />
                  {t("reply.actions.cancel")}
                </Button>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="sm"
                      className="h-8 rounded-md px-2.5 text-xs font-medium"
                      disabled={!replyBody.trim() || isSubmittingReply}
                      onClick={() => void handleSubmitReply()}
                    >
                      <SendHorizontal className="mr-1.5 size-3.5" />
                      {t("reply.actions.reply")}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <div className="flex items-center gap-2">
                      <span>{t("reply.tooltips.sendReply")}</span>
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
              className="h-8 rounded-md px-2.5 text-xs font-medium"
              disabled={!canEdit}
              onClick={() => setReplyOpen((value) => !value)}
            >
              <MessageSquareReply className="mr-1.5 size-3.5" />
              {t("reply.actions.reply")}
            </Button>
            {comment.status === "open" && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 rounded-md border-emerald-500/40! bg-emerald-500/10! px-2.5 text-xs font-medium text-emerald-600 hover:bg-emerald-500/20 hover:text-emerald-700"
                  disabled={!canEdit}
                  onClick={() => onUpdateStatus(comment.guid, "fixed")}
                >
                  <CheckCircle2 className="mr-1.5 size-3.5" />
                  {t("actions.markFixed")}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 rounded-md border-muted-foreground/30! bg-muted! px-2.5 text-xs font-medium text-muted-foreground hover:bg-muted/80 hover:text-foreground"
                  disabled={!canEdit}
                  onClick={() => onUpdateStatus(comment.guid, "dismissed")}
                >
                  <XCircle className="mr-1.5 size-3.5" />
                  {t("actions.dismiss")}
                </Button>
              </>
            )}
            {comment.status === "agent_fixed" && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 rounded-md border-emerald-500/40! bg-emerald-500/10! px-2.5 text-xs font-medium text-emerald-600 hover:bg-emerald-500/20 hover:text-emerald-700"
                  disabled={!canEdit}
                  onClick={() => onUpdateStatus(comment.guid, "fixed")}
                >
                  <CheckCircle2 className="mr-1.5 size-3.5" />
                  {t("actions.markFixed")}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 rounded-md border-blue-500/40! bg-blue-500/10! px-2.5 text-xs font-medium text-blue-600 hover:bg-blue-500/20 hover:text-blue-700"
                  disabled={!canEdit}
                  onClick={() => onUpdateStatus(comment.guid, "open")}
                >
                  <RotateCcw className="mr-1.5 size-3.5" />
                  {t("actions.reopen")}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 rounded-md border-muted-foreground/30! bg-muted! px-2.5 text-xs font-medium text-muted-foreground hover:bg-muted/80 hover:text-foreground"
                  disabled={!canEdit}
                  onClick={() => onUpdateStatus(comment.guid, "dismissed")}
                >
                  <XCircle className="mr-1.5 size-3.5" />
                  {t("actions.dismiss")}
                </Button>
              </>
            )}
            {comment.status === "fixed" && (
              <Button
                size="sm"
                variant="outline"
                className="h-8 rounded-md border-blue-500/40! bg-blue-500/10! px-2.5 text-xs font-medium text-blue-600 hover:bg-blue-500/20 hover:text-blue-700"
                disabled={!canEdit}
                onClick={() => onUpdateStatus(comment.guid, "open")}
              >
                <RotateCcw className="mr-1.5 size-3.5" />
                {t("actions.reopen")}
              </Button>
            )}
            {comment.status === "dismissed" && (
              <Button
                size="sm"
                variant="outline"
                className="h-8 rounded-md border-blue-500/40! bg-blue-500/10! px-2.5 text-xs font-medium text-blue-600 hover:bg-blue-500/20 hover:text-blue-700"
                disabled={!canEdit}
                onClick={() => onUpdateStatus(comment.guid, "open")}
              >
                <RotateCcw className="mr-1.5 size-3.5" />
                {t("actions.reopen")}
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
};
