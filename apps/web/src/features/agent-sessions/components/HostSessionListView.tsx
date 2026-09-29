"use client";

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useVirtualizer } from "@tanstack/react-virtual";
import { motion } from "motion/react";
import {
  Badge,
  Button,
  EmptyAction,
  IconArrowRight,
  IconChat,
  IconDanger,
  IconFilter,
  IconSearch,
  Input,
  LayersIcon,
  ScrollArea,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  cn,
} from "@workspace/ui";
import {
  ChevronDown,
  Folder,
  Loader2,
  RotateCcw,
  Search,
} from "lucide-react";
import { AgentIcon } from "@/features/agent/components/AgentIcon";
import { hostSessionApi } from "@/api/ws/host-session-api";
import { HostSessionBulkToolbar } from "@/features/agent-sessions/components/HostSessionBulkToolbar";
import { HostSessionCheckReveal } from "@/features/agent-sessions/components/HostSessionCheckReveal";
import { HostSessionFilterSortMenu } from "@/features/agent-sessions/components/HostSessionFilterSortMenu";
import { HostSessionResultCard } from "@/features/agent-sessions/components/HostSessionResultCard";
import { useHostSessionList } from "@/features/agent-sessions/hooks/use-host-session-list";
import { useHostSessionListQuery } from "@/features/agent-sessions/hooks/use-host-session-list-query";
import { useHostSessionSelection } from "@/features/agent-sessions/hooks/use-host-session-selection";
import {
  EMPTY_HOST_SESSION_FILTERS,
  hostSessionFilterCount,
  hostSessionOpenTarget,
  type HostSessionFilters,
} from "@/features/agent-sessions/lib/host-session-filters";
import {
  hostSessionArchiveAction,
  nextHostSessionSelection,
  sessionIsArchived,
} from "@/features/agent-sessions/lib/host-session-selection";
import {
  DEFAULT_HOST_SESSION_SORT,
  flattenHostSessionRows,
  hostSessionAgentIconId,
  type HostSessionGroupMode,
  type HostSessionSort,
  type HostSessionVirtualRow,
} from "@/features/agent-sessions/lib/host-session-groups";
import { PageEmptyState } from "@/shared/components/PageEmptyState";
import { useAppRouter } from "@/shared/hooks/use-app-router";

const SESSION_ROW_ESTIMATE = 92;
const HEADER_ROW_ESTIMATE = 48;
const LIST_OVERSCAN = 10;
const GROUP_COLLAPSE_MS = 300;

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

function HostSessionGroupGlyph({
  icon,
  collapsed,
}: {
  icon: React.ReactNode;
  collapsed: boolean;
}) {
  return (
    <span className="relative size-4 shrink-0 overflow-hidden text-muted-foreground transition-colors duration-150 group-hover/header:text-foreground">
      <span
        className="absolute inset-0 flex items-center justify-center transition-opacity duration-150 group-hover/header:opacity-0 group-focus-visible/header:opacity-0"
        aria-hidden
      >
        {icon}
      </span>
      <ChevronDown
        className={cn(
          "absolute inset-0 size-4 opacity-0 transition-[opacity,rotate] duration-150 ease-out group-hover/header:opacity-100 group-focus-visible/header:opacity-100",
          collapsed ? "-rotate-90" : "rotate-0",
        )}
        aria-hidden
      />
    </span>
  );
}

export function HostSessionListView() {
  const t = useTranslations("agentSessions");
  const router = useAppRouter();
  const { listQuery: query, setListQuery: setQuery } = useHostSessionListQuery();
  const [groupMode, setGroupMode] = useState<HostSessionGroupMode>("all");
  const [filters, setFilters] = useState<HostSessionFilters>(EMPTY_HOST_SESSION_FILTERS);
  const [sort, setSort] = useState<HostSessionSort>(DEFAULT_HOST_SESSION_SORT);
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
    reload,
    loadMore,
  } = useHostSessionList({ query, filters, sort });
  const { selectedKey, selectKey } = useHostSessionSelection();
  const [checkedKeys, setCheckedKeys] = useState<Set<string>>(() => new Set());
  const [archivedOverride, setArchivedOverride] = useState<Record<string, boolean>>({});
  const [concealedKeys, setConcealedKeys] = useState<string[]>([]);
  const [pendingDelete, setPendingDelete] = useState<{
    token: number;
    keys: string[];
    includeChat: boolean;
    includeSource: boolean;
  } | null>(null);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const undoTokenRef = useRef(0);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [closingGroups, setClosingGroups] = useState<Record<string, boolean>>({});
  const parentRef = useRef<HTMLDivElement>(null);
  const rowsRef = useRef<HostSessionVirtualRow[]>([]);
  const collapseGenRef = useRef(0);
  const collapsePlayRef = useRef<{ key: string; direction: "in" | "out"; progress: number } | null>(
    null,
  );
  const pendingExpandRef = useRef<string | null>(null);

  const hitByRoot = useMemo(() => {
    const map = new Map<string, (typeof hits)[number]>();
    for (const hit of hits) {
      map.set(hit.root_session_key, hit);
    }
    return map;
  }, [hits]);
  const archivedOf = useCallback(
    (session: (typeof sessions)[number]) =>
      archivedOverride[session.key] ?? sessionIsArchived(session),
    [archivedOverride],
  );
  const visibleSessions = useMemo(
    () =>
      sessions.filter((session) => {
        if (pendingDelete?.keys.includes(session.key) || concealedKeys.includes(session.key)) {
          return false;
        }
        if (!filters.showArchived && archivedOf(session)) return false;
        return true;
      }),
    [archivedOf, concealedKeys, filters.showArchived, pendingDelete, sessions],
  );
  const visibleKeySig = visibleSessions.map((session) => session.key).join("\n");
  const sessionStamp = sessions.map((session) => `${session.key}:${session.archived}`).join("|");
  const rows = useMemo(
    () => flattenHostSessionRows(visibleSessions, groupMode, t("unknownProject"), sort, collapsed),
    [collapsed, groupMode, sort, t, visibleSessions],
  );
  rowsRef.current = rows;

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) => {
      const row = rows[index];
      if (!row || row.kind === "header") return HEADER_ROW_ESTIMATE;
      return SESSION_ROW_ESTIMATE;
    },
    overscan: LIST_OVERSCAN,
    getItemKey: (index) => {
      const row = rows[index];
      if (!row) return index;
      return row.kind === "header" ? `header:${row.group.key}` : row.session.key;
    },
  });

  const tweenGroup = useCallback(
    (key: string, direction: "in" | "out", startProgress: number) => {
      const gen = ++collapseGenRef.current;
      collapsePlayRef.current = { key, direction, progress: startProgress };
      setClosingGroups((current) => ({ ...current, [key]: direction === "out" }));
      const started = performance.now() - startProgress * GROUP_COLLAPSE_MS;
      const tick = (now: number) => {
        if (collapseGenRef.current !== gen) return;
        const progress = Math.min(1, (now - started) / GROUP_COLLAPSE_MS);
        collapsePlayRef.current = { key, direction, progress };
        const eased = easeOutCubic(progress);
        const size = Math.max(
          0,
          Math.round(SESSION_ROW_ESTIMATE * (direction === "out" ? 1 - eased : eased)),
        );
        rowsRef.current.forEach((row, index) => {
          if (row.kind === "session" && row.groupKey === key) {
            virtualizer.resizeItem(index, size);
          }
        });
        if (progress < 1) {
          requestAnimationFrame(tick);
          return;
        }
        collapsePlayRef.current = null;
        if (direction === "out") {
          setCollapsed((current) => ({ ...current, [key]: true }));
          setClosingGroups((current) => {
            const next = { ...current };
            delete next[key];
            return next;
          });
        }
      };
      requestAnimationFrame(tick);
    },
    [virtualizer],
  );

  const toggleGroup = useCallback(
    (key: string) => {
      const playing = collapsePlayRef.current?.key === key ? collapsePlayRef.current : null;
      if (playing) {
        tweenGroup(key, playing.direction === "out" ? "in" : "out", 1 - playing.progress);
        return;
      }
      if (collapsed[key]) {
        pendingExpandRef.current = key;
        setCollapsed((current) => ({ ...current, [key]: false }));
        return;
      }
      tweenGroup(key, "out", 0);
    },
    [collapsed, tweenGroup],
  );

  useLayoutEffect(() => {
    const key = pendingExpandRef.current;
    if (!key) return;
    pendingExpandRef.current = null;
    rowsRef.current.forEach((row, index) => {
      if (row.kind === "session" && row.groupKey === key) {
        virtualizer.resizeItem(index, 0);
      }
    });
    tweenGroup(key, "in", 0);
  }, [rows, tweenGroup, virtualizer]);

  const didInitGroups = useRef(false);
  useEffect(() => {
    if (!didInitGroups.current) {
      didInitGroups.current = true;
      return;
    }
    collapseGenRef.current += 1;
    collapsePlayRef.current = null;
    pendingExpandRef.current = null;
    setClosingGroups({});
    setCollapsed({});
  }, [groupMode]);

  useEffect(() => {
    parentRef.current?.scrollTo({ top: 0 });
  }, [filters, groupMode, query, sort]);

  useEffect(() => {
    const el = parentRef.current;
    if (!el) return;
    const onScroll = () => {
      if (!hasMore || isLoadingMore || isLoading || error) return;
      if (el.scrollHeight - el.scrollTop - el.clientHeight < 480) {
        loadMore();
      }
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [error, hasMore, isLoading, isLoadingMore, loadMore]);

  useEffect(() => {
    const el = parentRef.current;
    if (!el || !hasMore || isLoadingMore || isLoading || error) return;
    if (el.scrollHeight <= el.clientHeight + 80) {
      loadMore();
    }
  }, [error, hasMore, isLoading, isLoadingMore, loadMore, rows.length]);

  useEffect(() => {
    return () => {
      collapseGenRef.current += 1;
    };
  }, []);

  useEffect(() => {
    setArchivedOverride((current) => (Object.keys(current).length === 0 ? current : {}));
  }, [sessionStamp]);

  useEffect(() => {
    setConcealedKeys((current) => (current.length === 0 ? current : []));
  }, [sessions]);

  useEffect(() => {
    if (pendingDelete) return;
    const visible = new Set(visibleKeySig ? visibleKeySig.split("\n") : []);
    setCheckedKeys((current) => {
      let changed = false;
      const next = new Set<string>();
      for (const key of current) {
        if (visible.has(key)) next.add(key);
        else changed = true;
      }
      return changed ? next : current;
    });
  }, [pendingDelete, visibleKeySig]);

  const checkedList = useMemo(() => [...checkedKeys], [checkedKeys]);
  const archiveAction = hostSessionArchiveAction(checkedList, (key) => {
    const session = sessions.find((item) => item.key === key);
    return session ? archivedOf(session) : false;
  });
  const allChecked =
    visibleSessions.length > 0 && visibleSessions.every((session) => checkedKeys.has(session.key));

  const clearChecks = useCallback(() => {
    setPendingDelete(null);
    setCheckedKeys(new Set());
    setBulkError(null);
  }, []);

  const toggleChecked = useCallback((key: string, selected: boolean) => {
    setCheckedKeys((current) => {
      const next = new Set(current);
      if (selected) next.add(key);
      else next.delete(key);
      return next;
    });
  }, []);

  const archiveChecked = useCallback(async () => {
    if (archiveAction !== "archive" && archiveAction !== "unarchive") return;
    const keys = [...checkedKeys];
    const archived = archiveAction === "archive";
    setBulkBusy(true);
    setBulkError(null);
    try {
      await hostSessionApi.setArchived(keys, archived);
      setArchivedOverride((current) => {
        const next = { ...current };
        for (const key of keys) next[key] = archived;
        return next;
      });
      reload();
    } catch (err: unknown) {
      setBulkError(err instanceof Error ? err.message : t("bulk.failed"));
    } finally {
      setBulkBusy(false);
    }
  }, [archiveAction, checkedKeys, reload, t]);

  const armDelete = useCallback(
    (options: { includeChat: boolean; includeSource: boolean }) => {
      if (checkedKeys.size === 0) return;
      undoTokenRef.current += 1;
      setBulkError(null);
      setPendingDelete({
        token: undoTokenRef.current,
        keys: [...checkedKeys],
        includeChat: options.includeChat,
        includeSource: options.includeSource,
      });
    },
    [checkedKeys],
  );

  const commitDelete = useCallback(async () => {
    const pending = pendingDelete;
    if (!pending || bulkBusy) return;
    setBulkBusy(true);
    setBulkError(null);
    try {
      const result = await hostSessionApi.deleteSessions({
        keys: pending.keys,
        include_atmos_chat: pending.includeChat,
        include_source: pending.includeSource,
      });
      setConcealedKeys(result.deleted_keys);
      setCheckedKeys((current) => {
        const next = new Set(current);
        for (const key of result.deleted_keys) next.delete(key);
        return next;
      });
      if (result.failures.length > 0) {
        setBulkError(result.failures.join("; "));
      }
      reload();
    } catch (err: unknown) {
      setBulkError(err instanceof Error ? err.message : t("bulk.failed"));
      reload();
    } finally {
      setPendingDelete(null);
      setBulkBusy(false);
    }
  }, [bulkBusy, pendingDelete, reload, t]);

  const filterCount = hostSessionFilterCount(filters);
  const emptyKind =
    query.trim() ? "search" : sessions.length === 0 ? "homes" : filterCount > 0 ? "filters" : "list";
  const indexing =
    searchStatus === "indexing" ||
    (searchProgress != null &&
      searchProgress.total > 0 &&
      searchProgress.indexed < searchProgress.total);
  const indexPercent =
    searchProgress && searchProgress.total > 0
      ? Math.min(100, Math.round((searchProgress.indexed / searchProgress.total) * 100))
      : null;

  return (
    <TooltipProvider delayDuration={200}>
      <div className="relative flex h-full min-h-0 flex-col bg-background/50" data-testid="host-session-list">
        <div className="sticky top-0 z-10 shrink-0 bg-background/50 px-8 py-6 backdrop-blur-sm">
          <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex min-w-0 items-center gap-4">
                <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-sm ring-1 ring-primary/20">
                  <LayersIcon className="size-6" size={24} />
                </div>
                <div className="min-w-0">
                  <h2 className="text-xl font-bold tracking-tight text-balance text-foreground">
                    {t("title")}
                  </h2>
                  <p className="max-w-xs text-sm text-pretty text-muted-foreground">
                    {t("description")}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {indexing ? (
                  <Badge
                    variant="outline"
                    data-testid="host-session-index-progress"
                    aria-live="polite"
                    className="h-10 gap-1.5 rounded-xl border-border/50 bg-muted/20 px-3 text-xs font-medium tabular-nums text-muted-foreground"
                  >
                    <Loader2 className="size-3.5 animate-spin" />
                    {indexPercent == null
                      ? t("indexing")
                      : t("indexingProgress", { percent: indexPercent })}
                  </Badge>
                ) : null}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => refresh()}
                      disabled={isLoading || isSyncing}
                      className="size-10 shrink-0 rounded-xl border-border/50 bg-muted/20 shadow-sm hover:bg-background"
                      aria-label={t("refresh")}
                    >
                      {isLoading || isSyncing ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <RotateCcw className="size-4" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{t("refresh")}</TooltipContent>
                </Tooltip>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="group relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/60 group-focus-within:text-primary" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={t("searchPlaceholder")}
                  className="h-11 rounded-xl border-border/50 bg-muted/20 pl-10 shadow-sm transition-[background-color,box-shadow] duration-150 ease-[cubic-bezier(0.16,1,0.3,1)] focus:bg-background focus-visible:ring-1 focus-visible:ring-primary/20"
                />
              </div>
              <HostSessionFilterSortMenu
                sessions={sessions}
                facetProviders={facetProviders}
                facetProjects={facetProjects}
                filters={filters}
                groupMode={groupMode}
                sort={sort}
                onFiltersChange={setFilters}
                onGroupModeChange={setGroupMode}
                onSortChange={setSort}
              />
            </div>
          </div>
        </div>

        <ScrollArea
          className="min-h-0 flex-1"
          scrollFade
          viewportRef={parentRef}
          viewportClassName="outline-none"
        >
          <div className="px-8">
            <div
              className={cn(
                "mx-auto w-full max-w-5xl",
                checkedKeys.size > 0 || pendingDelete ? "pb-28" : "pb-12",
              )}
            >
              {isLoading && sessions.length === 0 ? (
                <div className="mt-6 space-y-3">
                  {Array.from({ length: 5 }).map((_, index) => (
                    <div
                      key={index}
                      className="flex animate-pulse items-center gap-4 rounded-lg border border-border/40 bg-background p-4"
                    >
                      <div className="size-10 rounded-lg bg-muted" />
                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="h-4 w-1/3 rounded bg-muted" />
                        <div className="h-3 w-1/2 rounded bg-muted" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : error && sessions.length === 0 ? (
                <PageEmptyState
                  icon={<IconDanger />}
                  title={t("errorTitle")}
                  description={t("error")}
                  actions={
                    <EmptyAction onClick={() => refresh()}>{t("retry")}</EmptyAction>
                  }
                />
              ) : rows.length === 0 ? (
                <PageEmptyState
                  icon={
                    emptyKind === "search" ? (
                      <IconSearch />
                    ) : emptyKind === "homes" ? (
                      <IconChat />
                    ) : (
                      <IconFilter />
                    )
                  }
                  title={
                    sessions.length > 0 && visibleSessions.length === 0 && !filters.showArchived
                      ? t("emptyArchivedTitle")
                      : emptyKind === "homes"
                        ? t("emptyHomesTitle")
                        : emptyKind === "search"
                          ? t("emptySearchTitle")
                          : t("emptyListTitle")
                  }
                  description={
                    sessions.length > 0 && visibleSessions.length === 0 && !filters.showArchived
                      ? t("emptyArchived")
                      : emptyKind === "homes"
                        ? t("emptyHomes")
                        : emptyKind === "search"
                          ? t("emptySearch")
                          : t("emptyList")
                  }
                  actions={
                    emptyKind === "search" ? (
                      <EmptyAction emphasis="quiet" onClick={() => setQuery("")}>
                        {t("clearSearch")}
                      </EmptyAction>
                    ) : sessions.length > 0 &&
                      visibleSessions.length === 0 &&
                      !filters.showArchived ? (
                      <EmptyAction
                        emphasis="quiet"
                        onClick={() => setFilters({ ...filters, showArchived: true })}
                      >
                        {t("filter.showArchived")}
                      </EmptyAction>
                    ) : emptyKind === "filters" ? (
                      <EmptyAction
                        emphasis="quiet"
                        onClick={() => setFilters(EMPTY_HOST_SESSION_FILTERS)}
                      >
                        {t("filter.clear")}
                      </EmptyAction>
                    ) : emptyKind === "homes" ? (
                      <EmptyAction
                        emphasis="quiet"
                        trailing={<IconArrowRight />}
                        onClick={() => router.push("/agent-observer")}
                      >
                        {t("openObserver")}
                      </EmptyAction>
                    ) : undefined
                  }
                />
              ) : (
                <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }} aria-label={t("listAria")}>
                  {virtualizer.getVirtualItems().map((item) => {
                    const row = rows[item.index];
                    if (!row) return null;
                    if (row.kind === "header") {
                      const collapsedGroup =
                        Boolean(collapsed[row.group.key]) || Boolean(closingGroups[row.group.key]);
                      return (
                        <div
                          key={item.key}
                          className="absolute left-0 top-0 w-full"
                          style={{ height: item.size, transform: `translateY(${item.start}px)` }}
                        >
                          <button
                            type="button"
                            className="group/header flex h-11 w-full items-center gap-3 px-1 text-left text-muted-foreground transition-colors duration-150 hover:text-foreground"
                            aria-expanded={!collapsedGroup}
                            onClick={() => toggleGroup(row.group.key)}
                          >
                            <HostSessionGroupGlyph
                              collapsed={collapsedGroup}
                              icon={
                                row.group.providerId ? (
                                  <AgentIcon
                                    registryId={hostSessionAgentIconId(row.group.providerId)}
                                    name={row.group.label}
                                    size={16}
                                  />
                                ) : (
                                  <Folder className="size-4 shrink-0" />
                                )
                              }
                            />
                            <span className="min-w-0 flex-1 truncate text-[11px] font-medium tracking-wide transition-colors duration-150">
                              {row.group.label}
                            </span>
                            <span className="rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 font-mono text-[10px] font-medium text-primary">
                              {row.group.sessions.length}
                            </span>
                          </button>
                        </div>
                      );
                    }

                    const session = row.session;
                    const hit = hitByRoot.get(session.key);
                    const selected =
                      selectedKey === session.key || selectedKey === hit?.session_key;
                    const title = session.title.trim() || session.native_id;
                    return (
                      <div
                        key={item.key}
                        className={cn(
                          "absolute left-0 top-0 w-full overflow-hidden",
                          item.size < SESSION_ROW_ESTIMATE && "pointer-events-none",
                        )}
                        style={{
                          height: item.size,
                          opacity: item.size / SESSION_ROW_ESTIMATE,
                          transform: `translateY(${item.start}px)`,
                        }}
                      >
                        <div className="pb-2">
                          <HostSessionCheckReveal
                            selected={checkedKeys.has(session.key)}
                            forceOpen={checkedKeys.size > 0}
                            label={t("selectSession", { title })}
                            onSelectedChange={(checked) => toggleChecked(session.key, checked)}
                          >
                            <HostSessionResultCard
                              session={session}
                              hit={hit}
                              query={query}
                              selected={selected}
                              archived={archivedOf(session)}
                              onSelect={() => {
                                const target = hostSessionOpenTarget(session, hit);
                                selectKey(target.key, {
                                  messageId: target.messageId,
                                  seq: target.seq,
                                });
                              }}
                            />
                          </HostSessionCheckReveal>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {isLoadingMore ? (
                <div className="flex items-center justify-center py-4 text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                </div>
              ) : null}
            </div>
          </div>
        </ScrollArea>
        {checkedKeys.size > 0 || pendingDelete ? (
          <HostSessionBulkToolbar
            count={pendingDelete ? pendingDelete.keys.length : checkedList.length}
            allSelected={allChecked}
            archiveAction={archiveAction}
            busy={bulkBusy}
            error={bulkError}
            undoToken={pendingDelete?.token ?? null}
            onSelectAll={() => {
              setCheckedKeys(nextHostSessionSelection(checkedKeys, visibleSessions.map((session) => session.key)));
            }}
            onArchive={() => {
              void archiveChecked();
            }}
            onDeleteArmed={armDelete}
            onUndo={() => {
              if (bulkBusy) return;
              setPendingDelete(null);
            }}
            onUndoCommit={() => {
              void commitDelete();
            }}
            onClose={clearChecks}
          />
        ) : null}
      </div>
    </TooltipProvider>
  );
}
