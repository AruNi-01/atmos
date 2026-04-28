"use client";

import React from "react";
import { Button } from "@workspace/ui";
import { cn } from "@/lib/utils";
import { MessageBubble } from "./MessageBubble";
import { formatDate, statusTone, threadTitle } from "./utils";
import type { ReviewThreadDto } from "@/api/ws-api";

const STATUS_LABELS: Record<string, string> = {
  open: "Open",
  agent_fixed: "Agent Fixed",
  fixed: "Fixed",
  dismissed: "Dismissed",
};

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
            "rounded-full border px-2 py-0.5 text-[11px] font-medium",
            statusTone(thread.status),
          )}
        >
          {STATUS_LABELS[thread.status] ?? thread.status.replaceAll("_", " ")}
        </span>
      </div>

      <div className="mt-3 space-y-2">
        {thread.messages.map((message) => (
          <MessageBubble key={message.guid} message={message} />
        ))}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
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