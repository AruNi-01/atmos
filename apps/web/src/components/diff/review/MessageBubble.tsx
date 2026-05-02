"use client";

import React, { useState } from "react";
import { Button, Textarea } from "@workspace/ui";
import { MarkdownRenderer } from "@/components/markdown/MarkdownRenderer";
import { cn } from "@/lib/utils";
import { formatReviewDateTime } from "./utils";
import { User, Bot } from "lucide-react";
import type { ReviewMessageDto } from "@/api/ws-api";

interface MessageBubbleActionControls {
  isEditing: boolean;
  startEdit: () => void;
}

interface MessageBubbleProps {
  message: ReviewMessageDto;
  action?: React.ReactNode | ((controls: MessageBubbleActionControls) => React.ReactNode);
  onEdit?: (message: ReviewMessageDto, body: string) => void | Promise<void>;
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({ message, action, onEdit }) => {
  const isUser = message.author_type === "user";
  const [isEditing, setIsEditing] = useState(false);
  const [editBody, setEditBody] = useState(message.body_full);
  const [isSaving, setIsSaving] = useState(false);

  const startEdit = () => {
    setEditBody(message.body_full);
    setIsEditing(true);
  };

  const cancelEdit = () => {
    setEditBody(message.body_full);
    setIsEditing(false);
  };

  const saveEdit = async () => {
    if (!onEdit) return;
    const nextBody = editBody.trim();
    if (!nextBody || nextBody === message.body_full.trim()) {
      cancelEdit();
      return;
    }
    setIsSaving(true);
    try {
      await onEdit(message, nextBody);
      setIsEditing(false);
    } finally {
      setIsSaving(false);
    }
  };

  const renderedAction =
    typeof action === "function" ? action({ isEditing, startEdit }) : action;

  return (
    <div
      className={cn(
        "relative rounded-md border px-3 py-2 text-sm whitespace-normal",
        isUser
          ? "border-border bg-muted/50"
          : "border-sky-500/20 bg-sky-500/5",
      )}
    >
      <div className="mb-1 flex items-center justify-between gap-2 text-[11px] font-medium tracking-wide text-muted-foreground">
        <span className="capitalize flex items-center gap-1">
          {isUser ? <User className="size-3" /> : <Bot className="size-3" />}
          {isUser ? "you" : message.author_type}
        </span>
        <span>{formatReviewDateTime(message.created_at)}</span>
      </div>
      <div className="min-w-0">
        {isEditing ? (
          <div
            className="space-y-2"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
          >
            <Textarea
              value={editBody}
              onChange={(event) => setEditBody(event.target.value)}
              onKeyDown={(event) => {
                event.stopPropagation();
                if (
                  event.key === "Enter" &&
                  (event.metaKey || event.ctrlKey) &&
                  editBody.trim() &&
                  !isSaving
                ) {
                  event.preventDefault();
                  void saveEdit();
                }
              }}
              className="min-h-28 bg-background text-sm"
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={isSaving}
                onClick={cancelEdit}
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={isSaving || !editBody.trim()}
                onClick={() => void saveEdit()}
              >
                Save
              </Button>
            </div>
          </div>
        ) : (
          <MarkdownRenderer className="min-w-0 flex-1 whitespace-normal text-sm leading-relaxed text-foreground prose-headings:my-2 prose-headings:font-semibold prose-h1:text-base prose-h2:text-base prose-h3:text-sm prose-p:my-1.5 prose-ul:my-1.5 prose-ol:my-1.5 prose-li:my-0.5">
            {message.body_full}
          </MarkdownRenderer>
        )}
      </div>
      {renderedAction && !isEditing && (
        <div className="absolute right-2 top-8 z-20">{renderedAction}</div>
      )}
    </div>
  );
};
