"use client";

import React, { useState } from "react";
import { Button, Textarea } from "@workspace/ui";
import { cn } from "@/lib/utils";
import { MessageBubble } from "./MessageBubble";
import {
  formatReviewDateTime,
  reviewThreadStatusLabel,
  statusTone,
  threadTitle,
} from "./utils";
import { MessageSquareReply, SendHorizontal, X } from "lucide-react";
import type { ReviewThreadDto } from "@/api/ws-api";

interface ThreadCardProps {
  thread: ReviewThreadDto;
  filePath: string;
  canEdit: boolean;
  onUpdateStatus: (threadGuid: string, status: string) => void | Promise<void>;
  onReply: (thread: ReviewThreadDto, body: string) => void | Promise<void>;
}

export const ThreadCard: React.FC<ThreadCardProps> = ({
  thread,
  filePath,
  canEdit,
  onUpdateStatus,
  onReply,
}) => {
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyBody, setReplyBody] = useState("");
  const [isSubmittingReply, setIsSubmittingReply] = useState(false);

  const handleSubmitReply = async () => {
    const body = replyBody.trim();
    if (!body) return;
    setIsSubmittingReply(true);
    try {
      await onReply(thread, body);
      setReplyBody("");
      setReplyOpen(false);
    } catch {
      // The shared review hook already shows the failure toast.
    } finally {
      setIsSubmittingReply(false);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-background/80 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">
            {threadTitle(thread)}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {thread.anchor.file_path || filePath} · {formatReviewDateTime(thread.created_at)}
          </p>
        </div>
        <span
          className={cn(
            "rounded-full border px-2 py-0.5 text-[11px] font-medium",
            statusTone(thread.status),
          )}
        >
          {reviewThreadStatusLabel(thread.status)}
        </span>
      </div>

      <div className="mt-3 space-y-2">
        {thread.messages.map((message) => (
          <MessageBubble key={message.guid} message={message} />
        ))}
      </div>

      {canEdit && replyOpen && (
        <div className="mt-3 rounded-md border border-border bg-background p-2">
          <Textarea
            value={replyBody}
            onChange={(event) => setReplyBody(event.target.value)}
            placeholder="Reply to this thread..."
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
            <Button
              size="sm"
              disabled={!replyBody.trim() || isSubmittingReply}
              onClick={() => void handleSubmitReply()}
            >
              <SendHorizontal className="mr-1.5 size-3.5" />
              Reply
            </Button>
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
        {thread.status === "open" && (
          <>
            <Button
              size="sm"
              variant="outline"
              className="border-emerald-500/40! bg-emerald-500/10! text-emerald-600 hover:bg-emerald-500/20 hover:text-emerald-700"
              disabled={!canEdit}
              onClick={() => onUpdateStatus(thread.guid, "fixed")}
            >
              Mark Fixed
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="border-muted-foreground/30! bg-muted! text-muted-foreground hover:bg-muted/80 hover:text-foreground"
              disabled={!canEdit}
              onClick={() => onUpdateStatus(thread.guid, "dismissed")}
            >
              Dismiss
            </Button>
          </>
        )}
        {thread.status === "agent_fixed" && (
          <>
            <Button
              size="sm"
              variant="outline"
              className="border-emerald-500/40! bg-emerald-500/10! text-emerald-600 hover:bg-emerald-500/20 hover:text-emerald-700"
              disabled={!canEdit}
              onClick={() => onUpdateStatus(thread.guid, "fixed")}
            >
              Mark Fixed
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="border-blue-500/40! bg-blue-500/10! text-blue-600 hover:bg-blue-500/20 hover:text-blue-700"
              disabled={!canEdit}
              onClick={() => onUpdateStatus(thread.guid, "open")}
            >
              Reopen
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="border-muted-foreground/30! bg-muted! text-muted-foreground hover:bg-muted/80 hover:text-foreground"
              disabled={!canEdit}
              onClick={() => onUpdateStatus(thread.guid, "dismissed")}
            >
              Dismiss
            </Button>
          </>
        )}
        {thread.status === "fixed" && (
          <Button
            size="sm"
            variant="outline"
            className="border-blue-500/40! bg-blue-500/10! text-blue-600 hover:bg-blue-500/20 hover:text-blue-700"
            disabled={!canEdit}
            onClick={() => onUpdateStatus(thread.guid, "open")}
          >
            Reopen
          </Button>
        )}
        {thread.status === "dismissed" && (
          <Button
            size="sm"
            variant="outline"
            className="border-blue-500/40! bg-blue-500/10! text-blue-600 hover:bg-blue-500/20 hover:text-blue-700"
            disabled={!canEdit}
            onClick={() => onUpdateStatus(thread.guid, "open")}
          >
            Reopen
          </Button>
        )}
      </div>
    </div>
  );
};
