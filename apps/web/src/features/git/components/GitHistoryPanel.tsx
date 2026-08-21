"use client";

/**
 * Center-tab git history graph. Lane SVG drawing follows Comet
 * (https://github.com/zeronsh/comet, MIT — see root NOTICE).
 * Search + chunked prefetch follow Zed's git graph (open source):
 * https://github.com/zed-industries/zed
 * Row virtualization uses @tanstack/react-virtual (fixed 36px rows).
 */

import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useTranslations } from "next-intl";
import {
  CaseSensitive,
  ChevronLeft,
  ChevronRight,
  LoaderCircle,
  RotateCcw,
} from "lucide-react";
import {
  Button,
  InputGroup,
  InputGroupButton,
  InputGroupInput,
} from "@workspace/ui";
import { cn } from "@/shared/lib/utils";
import type { GitHistoryCommit } from "@/api/ws-api-types";
import { useGitHistory } from "@/features/git/hooks/use-git-history";
import { useGitHistoryCenterTabStore } from "@/features/git/store/use-git-history-center-tab";
import { useGitStatusQuery } from "@/features/git/hooks/use-git-status-query";
import {
  TaskGithubDrawerHost,
  type TaskGithubDrawerController,
} from "@/features/task/components/task-github-drawer/TaskGithubDrawerHost";
import { commitDrawerKey } from "@/features/task/components/task-github-drawer/types";
import {
  HISTORY_ROW_HEIGHT,
  historyGraphWidth,
  layoutGitHistoryGraph,
} from "@/features/git/lib/git-history-graph";
import {
  HISTORY_COLUMN_DEFAULTS,
  HISTORY_RESIZE_COLUMNS,
  applyHistoryColumnResize,
  historyColumnDividerOffsets,
  historyGridTemplate,
  historyTableWidth,
  resolveHistoryColumnWidths,
  type HistoryColumnId,
  type HistoryColumnWidths,
} from "@/features/git/lib/git-history-columns";
import { collectGitHistoryMatchIndexes } from "@/features/git/lib/git-history-search";
import {
  ColumnResizeHandle,
  GitHistoryTableHeader,
} from "@/features/git/components/git-history-table-chrome";
import { GitHistoryGraphSvg } from "@/features/git/components/git-history-graph-svg";
import { GitHistoryRow } from "@/features/git/components/git-history-row";

const GIT_HISTORY_ROW_OVERSCAN = 12;

export function GitHistoryPanel({
  repoPath,
  contextId,
}: {
  repoPath: string | null;
  contextId: string;
}) {
  const t = useTranslations("git.history");
  const history = useGitHistory(repoPath);
  const statusQuery = useGitStatusQuery(repoPath);
  const githubOwner = statusQuery.data?.github_owner ?? null;
  const githubRepo = statusQuery.data?.github_repo ?? null;
  const drawerControllerRef = useRef<TaskGithubDrawerController | null>(null);
  const selectedHash = useGitHistoryCenterTabStore(
    (state) => state.selectedCommitByContext[contextId] ?? null,
  );
  const selectCommit = useGitHistoryCenterTabStore((state) => state.selectCommit);
  const layout = useMemo(
    () => layoutGitHistoryGraph(history.commits, history.headSha),
    [history.commits, history.headSha],
  );
  const graphMinWidth = historyGraphWidth(layout.maxLaneCount);
  const [columnWidths, setColumnWidths] = useState<HistoryColumnWidths>(
    HISTORY_COLUMN_DEFAULTS,
  );
  const [descriptionPinned, setDescriptionPinned] = useState(false);
  const [containerWidth, setContainerWidth] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);
  const resolvedColumns = useMemo(
    () =>
      resolveHistoryColumnWidths(columnWidths, {
        graphMin: graphMinWidth,
        containerWidth,
        descriptionPinned,
      }),
    [columnWidths, containerWidth, descriptionPinned, graphMinWidth],
  );
  const tableWidth = historyTableWidth(resolvedColumns);
  const gridTemplate = historyGridTemplate(resolvedColumns);
  const dividerOffsets = useMemo(
    () => historyColumnDividerOffsets(resolvedColumns),
    [resolvedColumns],
  );
  const [query, setQuery] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const matchIndexes = useMemo(
    () => collectGitHistoryMatchIndexes(history.commits, query, caseSensitive),
    [caseSensitive, history.commits, query],
  );
  const activeQuery = query.trim();
  const selectedMatchPosition = selectedHash
    ? matchIndexes.findIndex((index) => history.commits[index]?.hash === selectedHash)
    : -1;
  const matchIndexSet = useMemo(() => new Set(matchIndexes), [matchIndexes]);
  const autoSelectedQuery = useRef("");
  const virtualizer = useVirtualizer({
    count: history.commits.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => HISTORY_ROW_HEIGHT,
    overscan: GIT_HISTORY_ROW_OVERSCAN,
    getItemKey: (index) => history.commits[index]?.hash ?? index,
  });
  const virtualItems = virtualizer.getVirtualItems();
  const firstVirtualItem = virtualItems[0];
  const lastVirtualItem = virtualItems[virtualItems.length - 1];
  const lastVirtualIndex = lastVirtualItem?.index;

  useEffect(() => {
    if (lastVirtualIndex == null) return;
    if (!history.hasNextPage || history.isFetchingNextPage || history.error) return;
    if (lastVirtualIndex + GIT_HISTORY_ROW_OVERSCAN * 2 < history.commits.length) {
      return;
    }
    void history.fetchNextPage();
  }, [
    history.commits.length,
    history.error,
    history.fetchNextPage,
    history.hasNextPage,
    history.isFetchingNextPage,
    lastVirtualIndex,
  ]);

  const scrollToIndex = useCallback(
    (index: number) => {
      virtualizer.scrollToIndex(index, { align: "center" });
    },
    [virtualizer],
  );

  const selectMatchAt = useCallback(
    (position: number) => {
      const index = matchIndexes[position];
      const commit = index == null ? undefined : history.commits[index];
      if (index == null || !commit) return;
      selectCommit(contextId, commit.hash);
      scrollToIndex(index);
    },
    [contextId, history.commits, matchIndexes, scrollToIndex, selectCommit],
  );

  useEffect(() => {
    const searchKey = `${activeQuery}\0${caseSensitive}`;
    if (!activeQuery) {
      autoSelectedQuery.current = "";
      return;
    }
    if (matchIndexes.length === 0) return;
    if (autoSelectedQuery.current === searchKey) return;
    autoSelectedQuery.current = searchKey;
    selectMatchAt(0);
  }, [activeQuery, caseSensitive, matchIndexes.length, selectMatchAt]);

  const goToMatch = useCallback(
    (delta: number) => {
      if (matchIndexes.length === 0) return;
      const current = selectedMatchPosition < 0 ? 0 : selectedMatchPosition;
      const next = (current + delta + matchIndexes.length) % matchIndexes.length;
      selectMatchAt(next);
    },
    [matchIndexes.length, selectMatchAt, selectedMatchPosition],
  );

  const openCommitDrawer = useCallback(
    (commit: GitHistoryCommit) => {
      selectCommit(contextId, commit.hash);
      if (!githubOwner || !githubRepo) return;
      drawerControllerRef.current?.openCommit({
        kind: "commit",
        key: commitDrawerKey(githubOwner, githubRepo, commit.hash),
        owner: githubOwner,
        repo: githubRepo,
        sha: commit.hash,
        subject: commit.subject,
        authorName: commit.author_name,
        projectId: contextId,
      });
    },
    [contextId, githubOwner, githubRepo, selectCommit],
  );

  useLayoutEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    const measure = () => {
      setContainerWidth(node.clientWidth);
      setContainerHeight(node.clientHeight);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [history.commits.length]);

  const resizeColumn = useCallback(
    (id: HistoryColumnId, nextWidth: number) => {
      if (id === "description") setDescriptionPinned(true);
      setColumnWidths((current) =>
        applyHistoryColumnResize(current, id, nextWidth, graphMinWidth),
      );
    },
    [graphMinWidth],
  );

  if (!repoPath) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
        {t("noRepository")}
      </div>
    );
  }

  if (history.isLoading && history.commits.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-xs text-muted-foreground">
        <LoaderCircle className="size-4 animate-spin" />
        <span>{t("loading")}</span>
      </div>
    );
  }

  if (history.error && history.commits.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-xs text-warning">{history.error.message}</p>
        <Button size="sm" variant="outline" onClick={() => void history.refetch()}>
          {t("retry")}
        </Button>
      </div>
    );
  }

  if (history.commits.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
        {t("empty")}
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background" aria-label={t("title")}>
      <div className="flex h-10 shrink-0 items-center gap-1.5 px-2">
        <InputGroup className="!h-7 min-w-0 flex-1 shadow-none dark:bg-transparent">
          <InputGroupInput
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === "F3") {
                event.preventDefault();
                if (selectedMatchPosition < 0) {
                  selectMatchAt(event.shiftKey && matchIndexes.length > 0 ? matchIndexes.length - 1 : 0);
                } else {
                  goToMatch(event.shiftKey ? -1 : 1);
                }
              }
              if (event.key === "Escape" && query) {
                event.preventDefault();
                setQuery("");
              }
            }}
            placeholder={t("searchPlaceholder")}
            aria-label={t("searchPlaceholder")}
            className="h-7 min-w-0 text-xs"
          />
          <InputGroupButton
            type="button"
            size="icon-xs"
            aria-pressed={caseSensitive}
            aria-label={t("matchCase")}
            title={t("matchCase")}
            className={cn(
              "mr-1 size-5 h-5 w-5 shrink-0 rounded-md sm:size-5 sm:h-5 sm:w-5 before:rounded-[calc(var(--radius-md)-1px)]",
              caseSensitive && "bg-accent text-foreground",
            )}
            onClick={() => setCaseSensitive((current) => !current)}
          >
            <CaseSensitive className="size-3.5" />
          </InputGroupButton>
        </InputGroup>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          disabled={matchIndexes.length === 0}
          aria-label={t("previousMatch")}
          title={t("previousMatch")}
          onClick={() => goToMatch(-1)}
        >
          <ChevronLeft className="size-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          disabled={matchIndexes.length === 0}
          aria-label={t("nextMatch")}
          title={t("nextMatch")}
          onClick={() => goToMatch(1)}
        >
          <ChevronRight className="size-3.5" />
        </Button>
        {activeQuery ? (
          <span
            className={cn(
              "min-w-12 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground",
              matchIndexes.length === 0 && "text-destructive",
            )}
          >
            {t("matchCount", {
              current: matchIndexes.length === 0 ? 0 : selectedMatchPosition + 1,
              total: matchIndexes.length,
            })}
          </span>
        ) : null}
        {history.isFetchingNextPage ? (
          <LoaderCircle className="size-3.5 shrink-0 animate-spin text-muted-foreground" aria-label={t("loadingMore")} />
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7"
          aria-label={t("refresh")}
          onClick={() => void history.refetch()}
        >
          <RotateCcw
            className={cn(
              "size-3.5",
              history.isFetching && !history.isFetchingNextPage && "animate-spin-reverse",
            )}
          />
        </Button>
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto">
        <div className="relative" style={{ width: tableWidth, minWidth: tableWidth }}>
          <div className="sticky top-0 z-30 h-0">
            {HISTORY_RESIZE_COLUMNS.map((id) => (
              <ColumnResizeHandle
                key={id}
                column={id}
                width={resolvedColumns[id]}
                left={dividerOffsets[id]}
                height={containerHeight}
                label={t("resizeColumn", { column: t(`columns.${id}`) })}
                onResize={resizeColumn}
              />
            ))}
          </div>
          <GitHistoryTableHeader
            columns={resolvedColumns}
            gridTemplate={gridTemplate}
          />
          <div
            className="relative"
            style={{ height: virtualizer.getTotalSize() }}
          >
            {firstVirtualItem && lastVirtualItem ? (
              <div
                className="absolute top-0 right-0 left-0"
                style={{ transform: `translateY(${firstVirtualItem.start}px)` }}
              >
                <GitHistoryGraphSvg
                  rows={layout.rows.slice(
                    firstVirtualItem.index,
                    lastVirtualItem.index + 2,
                  )}
                  width={graphMinWidth}
                />
              </div>
            ) : null}
            {virtualItems.map((item) => {
              const commit = history.commits[item.index];
              const row = layout.rows[item.index];
              if (!commit || !row) return null;
              return (
                <div
                  key={item.key}
                  className="absolute top-0 left-0"
                  style={{
                    height: HISTORY_ROW_HEIGHT,
                    width: tableWidth,
                    transform: `translateY(${item.start}px)`,
                  }}
                >
                  <GitHistoryRow
                    commit={commit}
                    columns={resolvedColumns}
                    gridTemplate={gridTemplate}
                    nodeLane={row.nodeLane}
                    nodeColorId={row.nodeColorId}
                    isHead={row.isHead}
                    selected={selectedHash === commit.hash}
                    matched={activeQuery.length > 0 && matchIndexSet.has(item.index)}
                    query={activeQuery}
                    caseSensitive={caseSensitive}
                    onSelect={() => openCommitDrawer(commit)}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <TaskGithubDrawerHost controllerRef={drawerControllerRef} />
    </div>
  );
}
