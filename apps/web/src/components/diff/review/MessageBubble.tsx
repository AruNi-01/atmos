"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { formatReviewDateTime } from "./utils";
import type { ReviewMessageDto } from "@/api/ws-api";

interface MessageBubbleProps {
  message: ReviewMessageDto;
  action?: React.ReactNode;
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({ message, action }) => {
  const isUser = message.author_type === "user";
  return (
    <div
      className={cn(
        "rounded-md border px-3 py-2 text-sm",
        isUser
          ? "border-border bg-muted/50"
          : "border-sky-500/20 bg-sky-500/5",
      )}
    >
      <div className="mb-1 flex items-center justify-between gap-2 text-[11px] font-medium tracking-wide text-muted-foreground">
        <span className="capitalize">{isUser ? "you" : message.author_type}</span>
        <span>{formatReviewDateTime(message.created_at)}</span>
      </div>
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 flex-1 whitespace-pre-wrap break-words text-foreground">
          {message.body_full}
        </p>
        {action && <div className="shrink-0">{action}</div>}
      </div>
    </div>
  );
};
