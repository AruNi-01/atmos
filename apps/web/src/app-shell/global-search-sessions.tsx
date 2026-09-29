"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Button, CommandGroup, CommandItem, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger, cn } from "@workspace/ui";
import { Folder, Loader2, MessageSquare, RotateCcw } from "lucide-react";
import { GlobalSearchSubViewFrame } from "@/app-shell/global-search-subview";
import { AgentIcon } from "@/features/agent/components/AgentIcon";
import { HostSessionDetailView } from "@/features/agent-sessions/components/HostSessionDetailView";
import { HostSessionFilterSortMenu } from "@/features/agent-sessions/components/HostSessionFilterSortMenu";
import {
  HostSessionResultBody,
  hostSessionResultClass,
} from "@/features/agent-sessions/components/HostSessionResultCard";
import { useHostSessionList } from "@/features/agent-sessions/hooks/use-host-session-list";
import {
  hostSessionOpenTarget,
  type HostSessionFilters,
  type HostSessionOpenTarget,
} from "@/features/agent-sessions/lib/host-session-filters";
import {
  flattenHostSessionRows,
  hostSessionAgentIconId,
  type HostSessionGroupMode,
  type HostSessionSort,
} from "@/features/agent-sessions/lib/host-session-groups";

export type SessionSearchControls = {
  filters: HostSessionFilters;
  sort: HostSessionSort;
  groupMode: HostSessionGroupMode;
  onFiltersChange: (filters: HostSessionFilters) => void;
  onSortChange: (sort: HostSessionSort) => void;
  onGroupModeChange: (mode: HostSessionGroupMode) => void;
};

export function sessionCommandValue(key: string) {
  return `session:${key}`;
}

const SESSION_COMMAND_ITEM_CLASS = cn(
  hostSessionResultClass(false),
  "mb-2 cursor-pointer !h-[84px] !px-4 !py-0",
  "hover:!border-primary/30 hover:!bg-muted/50 hover:!text-foreground",
  "data-[selected=true]:!border-primary/40 data-[selected=true]:!bg-muted/50 data-[selected=true]:!text-foreground data-[selected=true]:!shadow-sm",
);

function SessionSearchResults({
  query,
  controls,
  syncOnMount,
  onSourcesSynced,
  onFirstValueChange,
  onOpen,
}: {
  query: string;
  controls: SessionSearchControls;
  syncOnMount: boolean;
  onSourcesSynced: () => void;
  onFirstValueChange: (value: string) => void;
  onOpen: (target: HostSessionOpenTarget) => void;
}) {
  const t = useTranslations("agentSessions");
  const { filters, sort, groupMode, onFiltersChange, onSortChange, onGroupModeChange } = controls;
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const {
    sessions,
    hits,
    searchStatus,
    searchProgress,
    isLoading,
    isLoadingMore,
    isSyncing,
    hasMore,
    facetProviders,
    facetProjects,
    error,
    refresh,
    loadMore,
  } = useHostSessionList({ query, filters, sort, syncOnMount, onSourcesSynced });

  const hitByRoot = useMemo(() => {
    const map = new Map<string, (typeof hits)[number]>();
    for (const hit of hits) map.set(hit.root_session_key, hit);
    return map;
  }, [hits]);

  const rows = useMemo(
    () => flattenHostSessionRows(sessions, groupMode, t("unknownProject"), sort, collapsed),
    [collapsed, groupMode, sessions, sort, t],
  );

  const firstValue = useMemo(() => {
    const row = rows.find((item) => item.kind === "session");
    return row && row.kind === "session" ? sessionCommandValue(row.session.key) : "";
  }, [rows]);

  useEffect(() => {
    setCollapsed({});
  }, [groupMode]);

  useEffect(() => {
    onFirstValueChange(firstValue);
  }, [firstValue, onFirstValueChange]);

  useEffect(() => () => onFirstValueChange(""), [onFirstValueChange]);

  const indexing =
    searchStatus === "indexing" ||
    (searchProgress != null && searchProgress.total > 0 && searchProgress.indexed < searchProgress.total);
  const indexPercent =
    searchProgress && searchProgress.total > 0
      ? Math.min(100, Math.round((searchProgress.indexed / searchProgress.total) * 100))
      : null;

  return (
    <TooltipProvider delayDuration={200}>
    <>
      <div className="sticky top-0 z-10 flex items-center justify-between gap-2 bg-muted/80 px-1 py-1.5 backdrop-blur-sm">
        <div className="flex min-w-0 items-center gap-1.5 px-1 text-xs text-muted-foreground" aria-live="polite">
          {indexing ? (
            <>
              <Loader2 className="size-3.5 shrink-0 animate-spin" />
              <span className="truncate">
                {indexPercent == null ? t("indexing") : t("indexingProgress", { percent: indexPercent })}
              </span>
            </>
          ) : (
            <span className="truncate">{t("title")}</span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-7 shrink-0 text-muted-foreground"
                aria-label={t("refresh")}
                disabled={isLoading || isSyncing}
                onClick={() => refresh()}
              >
                {isLoading || isSyncing ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <RotateCcw className="size-3.5" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t("refresh")}</TooltipContent>
          </Tooltip>
          <HostSessionFilterSortMenu
            sessions={sessions}
            facetProviders={facetProviders}
            facetProjects={facetProjects}
            filters={filters}
            groupMode={groupMode}
            sort={sort}
            onFiltersChange={onFiltersChange}
            onGroupModeChange={onGroupModeChange}
            onSortChange={onSortChange}
          />
        </div>
      </div>

      {isLoading && sessions.length === 0 ? (
        <div className="flex h-[220px] items-center justify-center text-sm text-muted-foreground">
          {t("loading")}
        </div>
      ) : error && sessions.length === 0 ? (
        <CommandGroup>
          <CommandItem value="session-retry" onSelect={() => refresh()}>
            {t("error")} · {t("retry")}
          </CommandItem>
        </CommandGroup>
      ) : rows.length === 0 ? (
        <div className="flex h-[220px] items-center justify-center px-6 text-center text-sm text-muted-foreground">
          {query.trim() ? t("emptySearch") : t("emptyList")}
        </div>
      ) : (
        <CommandGroup>
          {rows.map((row) => {
            if (row.kind === "header") {
              const isCollapsed = Boolean(collapsed[row.group.key]);
              return (
                <button
                  key={`header:${row.group.key}`}
                  type="button"
                  className="flex h-8 w-full items-center gap-2 px-2 text-left text-xs text-muted-foreground hover:text-foreground"
                  aria-expanded={!isCollapsed}
                  onClick={() =>
                    setCollapsed((current) => ({
                      ...current,
                      [row.group.key]: !current[row.group.key],
                    }))
                  }
                >
                  {row.group.providerId ? (
                    <AgentIcon
                      registryId={hostSessionAgentIconId(row.group.providerId)}
                      name={row.group.label}
                      size={14}
                    />
                  ) : (
                    <Folder className="size-3.5 shrink-0" />
                  )}
                  <span className="min-w-0 flex-1 truncate">{row.group.label}</span>
                  <span className="font-mono text-[10px]">{row.group.sessions.length}</span>
                </button>
              );
            }

            const hit = hitByRoot.get(row.session.key);
            return (
              <CommandItem
                key={row.session.key}
                value={sessionCommandValue(row.session.key)}
                onSelect={() => onOpen(hostSessionOpenTarget(row.session, hit))}
                className={SESSION_COMMAND_ITEM_CLASS}
              >
                <HostSessionResultBody
                  session={row.session}
                  hit={hit}
                  query={query}
                  archived={row.session.archived === true}
                />
              </CommandItem>
            );
          })}
          {hasMore ? (
            <CommandItem
              value="session-load-more"
              onSelect={() => loadMore()}
              disabled={isLoadingMore}
            >
              {isLoadingMore ? <Loader2 className="size-3.5 animate-spin" /> : null}
              {t("loadMore")}
            </CommandItem>
          ) : null}
        </CommandGroup>
      )}
    </>
    </TooltipProvider>
  );
}

function SessionSubView({
  target,
  searchQuery,
  onBack,
  onNavigated,
}: {
  target: HostSessionOpenTarget;
  searchQuery: string;
  onBack: () => void;
  onNavigated: () => void;
}) {
  const t = useTranslations("appShell");
  return (
    <GlobalSearchSubViewFrame
      icon={<MessageSquare className="size-4 shrink-0 text-muted-foreground" />}
      title={t("globalSearch.tabs.sessions")}
      onBack={onBack}
    >
      <div className="min-h-0 flex-1 overflow-hidden">
        <HostSessionDetailView
          selectedKey={target.key}
          messageId={target.messageId}
          seq={target.seq}
          searchQuery={searchQuery}
          onNavigated={onNavigated}
        />
      </div>
    </GlobalSearchSubViewFrame>
  );
}

export { SessionSearchResults, SessionSubView };
