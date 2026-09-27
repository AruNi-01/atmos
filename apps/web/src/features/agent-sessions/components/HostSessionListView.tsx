"use client";

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useVirtualizer } from "@tanstack/react-virtual";
import { motion } from "motion/react";
import {
  Badge,
  Button,
  Input,
  ScrollArea,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  cn,
} from "@workspace/ui";
import { formatLocalDateTime, formatRelativeTime, parseUTCDate } from "@atmos/shared";
import {
  Archive,
  ChevronDown,
  Folder,
  Layers,
  Loader2,
  MessageSquare,
  RotateCcw,
  Search,
} from "lucide-react";
import { AgentIcon } from "@/features/agent/components/AgentIcon";
import { hostSessionApi } from "@/api/ws/host-session-api";
import { HostSessionBulkToolbar } from "@/features/agent-sessions/components/HostSessionBulkToolbar";
import { HostSessionCheckReveal } from "@/features/agent-sessions/components/HostSessionCheckReveal";
import { HostSessionFilterSortMenu } from "@/features/agent-sessions/components/HostSessionFilterSortMenu";
import { useHostSessionList } from "@/features/agent-sessions/hooks/use-host-session-list";
import { useHostSessionListQuery } from "@/features/agent-sessions/hooks/use-host-session-list-query";
import { useHostSessionSelection } from "@/features/agent-sessions/hooks/use-host-session-selection";
import {
  EMPTY_HOST_SESSION_FILTERS,
  formatHostSessionBytes,
  hasAtmosChatTag,
  hostSessionFilterCount,
  hostSessionHighlightParts,
  hostSessionProjectLabel,
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
  hostSessionAgentLabel,
  type HostSessionGroupMode,
  type HostSessionSort,
  type HostSessionVirtualRow,
} from "@/features/agent-sessions/lib/host-session-groups";

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

function HostSessionHighlight({ text, query }: { text: string; query: string }) {
  return (
    <>
      {hostSessionHighlightParts(text, query).map((part, index) =>
        part.match ? (
          <mark
            key={`${part.text}-${index}`}
            className="rounded-sm bg-info/35 px-0.5 text-foreground"
          >
            {part.text}
          </mark>
        ) : (
          <React.Fragment key={`${part.text}-${index}`}>{part.text}</React.Fragment>
        ),
      )}
    </>
  );
}

function HostSessionEmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
      className="flex flex-col items-center justify-center py-24 text-center"
    >
      <div className="mb-5 flex size-16 items-center justify-center rounded-3xl bg-muted/20 text-muted-foreground/30">
        {icon}
      </div>
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
      <p className="mt-2 max-w-sm text-sm text-pretty text-muted-foreground">{description}</p>
      {action}
    </motion.div>
  );
}

export function HostSessionListView() {
  const t = useTranslations("agentSessions");
  const locale = useLocale();
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
    sessions.length === 0 ? "homes" : query.trim() ? "search" : filterCount > 0 ? "filters" : "list";
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
                  <Layers className="size-6" />
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
                <HostSessionEmptyState
                  icon={<Layers className="size-8" />}
                  title={t("errorTitle")}
                  description={t("error")}
                  action={
                    <Button
                      type="button"
                      variant="link"
                      onClick={() => refresh()}
                      className="mt-4"
                    >
                      {t("retry")}
                    </Button>
                  }
                />
              ) : rows.length === 0 ? (
                <HostSessionEmptyState
                  icon={
                    emptyKind === "search" ? (
                      <Search className="size-8" />
                    ) : emptyKind === "homes" ? (
                      <Layers className="size-8" />
                    ) : (
                      <Folder className="size-8" />
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
                  action={
                    emptyKind === "search" ? (
                      <Button
                        type="button"
                        variant="link"
                        onClick={() => setQuery("")}
                        className="mt-4"
                      >
                        {t("clearSearch")}
                      </Button>
                    ) : sessions.length > 0 &&
                      visibleSessions.length === 0 &&
                      !filters.showArchived ? (
                      <Button
                        type="button"
                        variant="link"
                        onClick={() => setFilters({ ...filters, showArchived: true })}
                        className="mt-4"
                      >
                        {t("filter.showArchived")}
                      </Button>
                    ) : emptyKind === "filters" ? (
                      <Button
                        type="button"
                        variant="link"
                        onClick={() => setFilters(EMPTY_HOST_SESSION_FILTERS)}
                        className="mt-4"
                      >
                        {t("filter.clear")}
                      </Button>
                    ) : null
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
                    const projectLabel = hostSessionProjectLabel(session);
                    const agentLabel = hostSessionAgentLabel(session.provider_id);
                    const title = session.title.trim() || session.native_id;
                    const hit = hitByRoot.get(session.key);
                    const searching = query.trim().length > 0;
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
                          onSelectedChange={(selected) => toggleChecked(session.key, selected)}
                        >
                        <button
                          type="button"
                          data-testid="host-session-item"
                          className={cn(
                            "group flex h-[84px] w-full items-center justify-between rounded-lg border px-4 text-left hover:border-primary/30 hover:bg-muted/50 hover:shadow-sm",
                            selectedKey === session.key || selectedKey === hit?.session_key
                              ? "border-primary/40 bg-muted/50 shadow-sm"
                              : "border-border bg-background",
                          )}
                          aria-current={
                            selectedKey === session.key || selectedKey === hit?.session_key
                              ? "true"
                              : undefined
                          }
                          onClick={() => {
                            if (hit && hit.kind !== "title") {
                              selectKey(hit.session_key, {
                                messageId: hit.message_id,
                                seq: hit.seq,
                              });
                              return;
                            }
                            selectKey(hit?.session_key ?? session.key);
                          }}
                        >
                          <div className="flex min-w-0 flex-1 items-center gap-4">
                            <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border/50 bg-muted/30 transition-colors duration-150 group-hover:border-primary/20 group-hover:bg-primary/5">
                              <AgentIcon
                                registryId={hostSessionAgentIconId(session.provider_id)}
                                name={agentLabel}
                                size={22}
                              />
                            </div>
                            <div className="flex min-w-0 flex-1 flex-col">
                              <div className="flex min-w-0 items-center gap-2">
                                <span className="truncate text-sm font-semibold text-foreground transition-colors duration-150 group-hover:text-primary">
                                  {searching ? (
                                    <HostSessionHighlight text={title} query={query} />
                                  ) : (
                                    title
                                  )}
                                </span>
                                {hasAtmosChatTag(session) ? (
                                  <span className="shrink-0 rounded-md border border-border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                                    {t("atmosChatTag")}
                                  </span>
                                ) : null}
                              </div>
                              <div className="mt-1 flex min-w-0 items-center gap-3 text-xs text-muted-foreground">
                                {searching && hit?.snippet ? (
                                  <span className="block min-w-0 truncate">
                                    <HostSessionHighlight text={hit.snippet} query={query} />
                                  </span>
                                ) : (
                                  <>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="flex min-w-0 items-center gap-1">
                                      <Folder className="size-3 shrink-0" />
                                      <span className="block max-w-[220px] truncate">
                                        {projectLabel || t("unknownProject")}
                                      </span>
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent className="max-w-xs break-all">
                                    {session.cwd || t("unknownProject")}
                                  </TooltipContent>
                                </Tooltip>
                                {session.message_count != null ? (
                                  <>
                                    <span className="text-border">·</span>
                                    <span className="flex shrink-0 items-center gap-1">
                                      <MessageSquare className="size-3 shrink-0" />
                                      <span className="whitespace-nowrap">
                                        {t("messageCount", { count: session.message_count })}
                                      </span>
                                    </span>
                                  </>
                                ) : null}
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="ml-4 flex shrink-0 items-center gap-3">
                            <div className="text-right">
                            <div className="text-[11px] font-medium tabular-nums text-muted-foreground">
                              {formatHostSessionBytes(session.byte_size) ?? "–"}
                            </div>
                            <div className="mt-0.5 whitespace-nowrap text-[10px] tabular-nums text-muted-foreground/55">
                              {session.updated_at &&
                              !Number.isNaN(parseUTCDate(session.updated_at).getTime())
                                ? `${formatLocalDateTime(session.updated_at, "yyyy/MM/dd HH:mm")} · ${formatRelativeTime(session.updated_at, locale)}`
                                : ""}
                            </div>
                            </div>
                            {archivedOf(session) ? (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span
                                    className="inline-flex text-muted-foreground"
                                    data-testid="host-session-archived-icon"
                                  >
                                    <Archive className="size-3.5" aria-hidden />
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent>{t("archived")}</TooltipContent>
                              </Tooltip>
                            ) : null}
                          </div>
                        </button>
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
