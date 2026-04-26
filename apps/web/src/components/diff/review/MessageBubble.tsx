"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { formatDate } from "./utils";
import type { ReviewMessageDto } from "@/api/ws-api";

interface MessageBubbleProps {
  message: ReviewMessageDto;
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({ message }) => {
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
      <div className="mb-1 flex items-center justify-between gap-2 text-[11px] uppercase tracking-wide text-muted-foreground">
        <span>{message.author_type}</span>
        <span>{formatDate(message.created_at)}</span>
      </div>
      <p className="whitespace-pre-wrap break-words text-foreground">
        {message.body_full}
      </p>
    </div>
  );
};
