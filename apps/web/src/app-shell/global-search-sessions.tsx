"use client";

import { useEffect, useMemo, useRef } from "react";
import { useTranslations } from "next-intl";
import { CommandGroup, CommandItem, cn } from "@workspace/ui";
import { Loader2, MessageSquare } from "lucide-react";
import { GlobalSearchSubViewFrame } from "@/app-shell/global-search-subview";
import { HostSessionDetailView } from "@/features/agent-sessions/components/HostSessionDetailView";
import {
  HostSessionResultBody,
  hostSessionResultClass,
} from "@/features/agent-sessions/components/HostSessionResultCard";
import { useHostSessionList } from "@/features/agent-sessions/hooks/use-host-session-list";
import {
  hostSessionOpenTarget,
  type HostSessionOpenTarget,
} from "@/features/agent-sessions/lib/host-session-filters";
import {
  DEFAULT_HOST_SESSION_SORT,
  flattenHostSessionRows,
} from "@/features/agent-sessions/lib/host-session-groups";

export function sessionCommandValue(key: string) {
  return `session:${key}`;
}

const SESSION_COMMAND_ITEM_CLASS = cn(
  hostSessionResultClass(false),
  "mb-2 cursor-pointer !h-[84px] !px-4 !py-0",
  "hover:!border-primary/30 hover:!bg-muted/50 hover:!text-foreground",
  "data-[selected=true]:!border-primary/40 data-[selected=true]:!bg-muted/50 data-[selected=true]:!text-foreground data-[selected=true]:!shadow-sm",
);

function sessionListScrollParent(node: HTMLElement | null): HTMLElement | null {
  const viewport = node?.closest("[data-slot='scroll-area-viewport']");
  if (viewport instanceof HTMLElement) return viewport;
  let current = node?.parentElement ?? null;
  while (current) {
    const overflow = getComputedStyle(current).overflowY;
    if (overflow === "auto" || overflow === "scroll") return current;
    current = current.parentElement;
  }
  return null;
}

function SessionSearchResults({
  query,
  syncOnMount,
  onSourcesSynced,
  onFirstValueChange,
  onOpen,
}: {
  query: string;
  syncOnMount: boolean;
  onSourcesSynced: () => void;
  onFirstValueChange: (value: string) => void;
  onOpen: (target: HostSessionOpenTarget) => void;
}) {
  const t = useTranslations("agentSessions");
  const listRef = useRef<HTMLDivElement>(null);
  const {
    sessions,
    hits,
    isLoading,
    isLoadingMore,
    hasMore,
    error,
    refresh,
    loadMore,
  } = useHostSessionList({ query, syncOnMount, onSourcesSynced });

  const hitByRoot = useMemo(() => {
    const map = new Map<string, (typeof hits)[number]>();
    for (const hit of hits) map.set(hit.root_session_key, hit);
    return map;
  }, [hits]);

  const rows = useMemo(
    () => flattenHostSessionRows(sessions, "all", "", DEFAULT_HOST_SESSION_SORT, {}),
    [sessions],
  );

  const firstValue = useMemo(() => {
    const row = rows.find((item) => item.kind === "session");
    return row && row.kind === "session" ? sessionCommandValue(row.session.key) : "";
  }, [rows]);

  useEffect(() => {
    onFirstValueChange(firstValue);
  }, [firstValue, onFirstValueChange]);

  useEffect(() => () => onFirstValueChange(""), [onFirstValueChange]);

  useEffect(() => {
    const el = sessionListScrollParent(listRef.current);
    if (!el) return;

    const nearBottom = () => el.scrollHeight - el.scrollTop - el.clientHeight < 480;
    const onScroll = () => {
      if (!hasMore || isLoadingMore || isLoading) return;
      if (nearBottom()) loadMore();
    };

    if (!error && hasMore && !isLoadingMore && !isLoading && nearBottom()) {
      loadMore();
    }

    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [error, hasMore, isLoading, isLoadingMore, loadMore, rows.length]);

  return (
    <div ref={listRef}>
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
        <>
          <CommandGroup>
            {rows.map((row) => {
              if (row.kind !== "session") return null;
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
          </CommandGroup>
          {isLoadingMore ? (
            <div className="flex items-center justify-center py-3 text-muted-foreground" aria-hidden>
              <Loader2 className="size-4 animate-spin" />
            </div>
          ) : null}
        </>
      )}
    </div>
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
