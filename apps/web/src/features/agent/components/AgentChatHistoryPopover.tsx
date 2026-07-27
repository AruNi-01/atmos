"use client";

import React from "react";
import { useTranslations } from "next-intl";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
  ScrollArea,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  cn,
} from "@workspace/ui";
import { History, Loader2 } from "lucide-react";
import { formatLocalDateTime } from "@atmos/shared";
import type { AgentChatSessionItem } from "@/api/rest-api";

interface AgentChatHistoryPopoverProps {
  historyOpen: boolean;
  setHistoryOpen: React.Dispatch<React.SetStateAction<boolean>>;
  historySessions: AgentChatSessionItem[];
  historyHasMore: boolean;
  historyLoading: boolean;
  historyCursor: string | null;
  historyResumeUnsupportedReason: string | null;
  historyUnsupportedReason: string | null;
  loadHistorySessions: (cursor?: string) => Promise<void>;
  handleSelectHistorySession: (s: AgentChatSessionItem) => void;
  isConnecting: boolean;
  triggerClassName?: string;
}

function formatHistoryCwd(cwd: string | null | undefined): string | null {
  const trimmed = cwd?.trim();
  if (!trimmed) return null;

  const normalized = trimmed.replace(/[\\/]+$/, "");
  if (!normalized) return trimmed;

  const parts = normalized.split(/[\\/]+/).filter(Boolean);
  if (parts.length <= 2) return normalized;

  return `.../${parts.slice(-2).join("/")}`;
}

export function AgentChatHistoryPopover({
  historyOpen,
  setHistoryOpen,
  historySessions,
  historyHasMore,
  historyLoading,
  historyCursor,
  historyResumeUnsupportedReason,
  historyUnsupportedReason,
  loadHistorySessions,
  handleSelectHistorySession,
  isConnecting,
  triggerClassName,
}: AgentChatHistoryPopoverProps) {
  const t = useTranslations("Agent.components");
  return (
    <Popover open={historyOpen} onOpenChange={setHistoryOpen}>
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <button
                type="button"
                className={cn(
                  // desktop-no-drag: header is a drag-region on standalone Electron.
                  "desktop-no-drag rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                  triggerClassName,
                )}
                aria-label={t("historyPopover.triggerAria")}
              >
                <History className="size-4" />
              </button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent side="bottom">{t("historyPopover.triggerTooltip")}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
          <p className="text-sm font-medium shrink-0">
            {t("historyPopover.title")}
          </p>
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="truncate text-[10px] text-muted-foreground/70 cursor-help max-w-[140px]">
                  {t("historyPopover.sourceLabel")}
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs break-all">
                <p className="text-[11px]">
                  {t("historyPopover.sourceTooltip")}
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
              {historyUnsupportedReason ?? t("historyPopover.empty")}
            </div>
          ) : (
            <div className="p-1">
              {historySessions.map((s) => {
                const displayedCwd = formatHistoryCwd(s.cwd);
                const displayedTime = s.updated_at
                  ? formatLocalDateTime(s.updated_at, "MM/dd HH:mm")
                  : null;
                return (
                  <button
                    key={s.acp_session_id}
                    type="button"
                    className="flex w-full flex-col items-start gap-0.5 rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-muted"
                    onClick={() => handleSelectHistorySession(s)}
                    disabled={isConnecting || Boolean(historyResumeUnsupportedReason)}
                    title={historyResumeUnsupportedReason ?? undefined}
                  >
                    <span className="w-full truncate font-medium">
                      {s.title || t("historyPopover.newChat")}
                    </span>
                    {(displayedCwd || displayedTime) ? (
                      <span className="flex w-full min-w-0 items-center gap-2 text-[11px] text-muted-foreground/80">
                        {displayedCwd ? (
                          <span className="min-w-0 flex-1 truncate" title={s.cwd ?? undefined}>
                            {displayedCwd}
                          </span>
                        ) : null}
                        {displayedTime ? (
                          <span className="shrink-0 text-muted-foreground">
                            {displayedTime}
                          </span>
                        ) : null}
                      </span>
                    ) : null}
                  </button>
                );
              })}
              {historyResumeUnsupportedReason ? (
                <div className="px-3 py-2 text-xs text-muted-foreground">
                  {historyResumeUnsupportedReason}
                </div>
              ) : null}
              {historyHasMore && historyCursor && (
                <button
                  type="button"
                  className="w-full rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted"
                  onClick={() => loadHistorySessions(historyCursor)}
                  disabled={historyLoading}
                >
                  {historyLoading ? t("common.loading") : t("historyPopover.loadMore")}
                </button>
              )}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
