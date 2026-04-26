"use client";

import React from "react";
import { Button } from "@workspace/ui";
import { cn } from "@/lib/utils";
import { MessageBubble } from "./MessageBubble";
import { formatDate, statusTone, threadTitle } from "./utils";
import type { ReviewThreadDto } from "@/api/ws-api";

interface ThreadCardProps {
  thread: ReviewThreadDto;
  filePath: string;
  canEdit: boolean;
  onUpdateStatus: (threadGuid: string, status: string) => void | Promise<void>;
}

export const ThreadCard: React.FC<ThreadCardProps> = ({
  thread,
  filePath,
  canEdit,
  onUpdateStatus,
}) => {
  return (
    <div className="rounded-lg border border-border bg-background/80 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">
            {threadTitle(thread)}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {thread.anchor.file_path || filePath} · {formatDate(thread.created_at)}
          </p>
        </div>
        <span
          className={cn(
            "rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize",
            statusTone(thread.status),
          )}
        >
          {thread.status.replaceAll("_", " ")}
        </span>
      </div>

      <div className="mt-3 space-y-2">
        {thread.messages.map((message) => (
          <MessageBubble key={message.guid} message={message} />
        ))}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={!canEdit}
          onClick={() => onUpdateStatus(thread.guid, "needs_user_check")}
        >
          Needs Check
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={!canEdit}
          onClick={() => onUpdateStatus(thread.guid, "fixed")}
        >
          Mark Fixed
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={!canEdit}
          onClick={() => onUpdateStatus(thread.guid, "dismissed")}
        >
          Dismiss
        </Button>
      </div>
    </div>
  );
};
