"use client";

import React from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
  ScrollArea,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@workspace/ui";
import { History, Loader2 } from "lucide-react";
import { formatLocalDateTime } from "@atmos/shared";
import type { AgentChatSessionItem } from "@/api/rest-api";
import type { AgentChatMode } from "@/types/agent-chat";

interface AgentChatHistoryPopoverProps {
  historyOpen: boolean;
  setHistoryOpen: React.Dispatch<React.SetStateAction<boolean>>;
  historySessions: AgentChatSessionItem[];
  historyHasMore: boolean;
  historyLoading: boolean;
  historyCursor: string | null;
  loadHistorySessions: (cursor?: string) => Promise<void>;
  handleSelectHistorySession: (s: AgentChatSessionItem) => void;
  isConnecting: boolean;
  chatMode: AgentChatMode;
  sessionWorkspaceId: string | null;
  sessionProjectId: string | null;
  localPath: string | null;
  wikiPath: string | null;
}

export function AgentChatHistoryPopover({
  historyOpen,
  setHistoryOpen,
  historySessions,
  historyHasMore,
  historyLoading,
  historyCursor,
  loadHistorySessions,
  handleSelectHistorySession,
  isConnecting,
  chatMode,
  sessionWorkspaceId,
  sessionProjectId,
  localPath,
  wikiPath,
}: AgentChatHistoryPopoverProps) {
  return (
    <Popover open={historyOpen} onOpenChange={setHistoryOpen}>
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label="Chat history"
              >
                <History className="size-4" />
              </button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent side="bottom">Chat history</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
          <p className="text-sm font-medium shrink-0">
            {chatMode === "wiki_ask" ? "Wiki Ask history" : "Chat history"}
          </p>
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="truncate text-[10px] text-muted-foreground/70 cursor-help max-w-[140px]">
                  {sessionWorkspaceId
                    ? `Workspace: ${localPath ? localPath.split("/").pop() : sessionWorkspaceId}`
                    : sessionProjectId
                      ? `Project: ${(wikiPath ?? localPath)?.split("/").pop() ?? sessionProjectId}`
                      : "Temp sessions"}
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs break-all">
                <p className="text-[11px]">
                  {sessionWorkspaceId
                    ? `Showing history for workspace${localPath ? `: ${localPath}` : ""}`
                    : sessionProjectId
                      ? `Showing history for project${(wikiPath ?? localPath) ? `: ${wikiPath ?? localPath}` : ""}`
                      : "Showing history for temporary sessions"}
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <ScrollArea className="h-[280px]">
          {historyLoading && historySessions.length === 0 ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : historySessions.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              {chatMode === "wiki_ask" ? "No Wiki Ask history yet" : "No history yet"}
            </div>
          ) : (
            <div className="p-1">
              {historySessions.map((s) => (
                <button
                  key={s.guid}
                  type="button"
                  className="flex w-full flex-col items-start gap-0.5 rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-muted"
                  onClick={() => handleSelectHistorySession(s)}
                  disabled={isConnecting}
                >
                  <span className="w-full truncate font-medium">
                    {s.title || "New chat"}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatLocalDateTime(s.created_at)}
                  </span>
                </button>
              ))}
              {historyHasMore && historyCursor && (
                <button
                  type="button"
                  className="w-full rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted"
                  onClick={() => loadHistorySessions(historyCursor)}
                  disabled={historyLoading}
                >
                  {historyLoading ? "Loading..." : "Load more"}
                </button>
              )}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
