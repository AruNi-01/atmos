"use client";

import React from "react";
import { useTranslations } from "next-intl";
import {
  Input,
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
import { History, Loader2, Search, X } from "lucide-react";
import { formatLocalDateTime } from "@atmos/shared";
import { agentChatCwdLabel } from "@/features/agent/lib/agent-chat-working-directory";
import {
  filterAgentChatHistoryRows,
  type AgentChatHistoryRow,
} from "@/features/agent/lib/agent-chat-thread";

interface AgentChatHistoryPopoverProps {
  historyOpen: boolean;
  setHistoryOpen: React.Dispatch<React.SetStateAction<boolean>>;
  historySessions: AgentChatHistoryRow[];
  historyHasMore: boolean;
  historyLoading: boolean;
  historyCursor: string | null;
  historyResumeUnsupportedReason: string | null;
  historyUnsupportedReason: string | null;
  loadHistorySessions: (cursor?: string) => Promise<void>;
  handleSelectHistorySession: (row: AgentChatHistoryRow) => void;
  isConnecting: boolean;
  triggerClassName?: string;
}

function formatHistoryCwd(cwd: string | null | undefined, threadLabel: string): string | null {
  const labeled = agentChatCwdLabel(cwd, threadLabel);
  if (!labeled) return null;
  if (labeled === threadLabel) return labeled;

  const normalized = labeled.replace(/[\\/]+$/, "");
  if (!normalized) return labeled;

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
  const searchInputRef = React.useRef<HTMLInputElement | null>(null);
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState("");
  const visibleSessions = React.useMemo(
    () => filterAgentChatHistoryRows(historySessions, searchQuery),
    [historySessions, searchQuery],
  );

  React.useEffect(() => {
    if (!historyOpen) {
      setSearchOpen(false);
      setSearchQuery("");
    }
  }, [historyOpen]);

  React.useEffect(() => {
    if (!searchOpen) return;
    searchInputRef.current?.focus();
  }, [searchOpen]);

  const handleOpenChange = React.useCallback((open: boolean) => {
    setHistoryOpen(open);
    if (open) void loadHistorySessions();
  }, [loadHistorySessions, setHistoryOpen]);

  return (
    <Popover open={historyOpen} onOpenChange={handleOpenChange}>
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <button
                type="button"
                className={cn(
                  // desktop-no-drag: header is a drag-region on standalone Electron.
                  "desktop-no-drag rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground",
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
          <button
            type="button"
            className={cn(
              "rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground",
              searchOpen && "bg-muted text-foreground",
            )}
            aria-label={t("historyPopover.searchAria")}
            aria-pressed={searchOpen}
            onClick={() => {
              setSearchOpen((open) => {
                const next = !open;
                if (!next) setSearchQuery("");
                return next;
              });
            }}
          >
            <Search className="size-3.5" />
          </button>
        </div>
        {searchOpen ? (
          <div className="border-b border-border px-3 py-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/70" />
              <Input
                ref={searchInputRef}
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder={t("historyPopover.searchPlaceholder")}
                className="h-8 rounded-md border-border/50 bg-muted/20 pl-8 pr-8 text-sm"
              />
              {searchQuery ? (
                <button
                  type="button"
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
                  aria-label={t("historyPopover.clearSearchAria")}
                  onClick={() => {
                    setSearchQuery("");
                    searchInputRef.current?.focus();
                  }}
                >
                  <X className="size-3.5" />
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
        <ScrollArea className="h-[280px]">
          {historyLoading && historySessions.length === 0 ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : historySessions.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              {historyUnsupportedReason ?? t("historyPopover.empty")}
            </div>
          ) : visibleSessions.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              {t("historyPopover.searchNoResults")}
            </div>
          ) : (
            <div className="p-1">
              {visibleSessions.map((s) => {
                const displayedCwd = formatHistoryCwd(
                  s.cwd,
                  t("composer.workingDirectory.thread"),
                );
                const displayedTime = s.updated_at
                  ? formatLocalDateTime(s.updated_at, "MM/dd HH:mm")
                  : null;
                return (
                  <button
                    key={s.chat_id}
                    type="button"
                    className="flex w-full flex-col items-start gap-0.5 rounded-md px-3 py-2 text-left text-sm hover:bg-muted"
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
                          <span className="min-w-0 flex-1 truncate" title={displayedCwd}>
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
                  className="w-full rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted"
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
