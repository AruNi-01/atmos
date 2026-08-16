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
import { useTranslations, useLocale } from "next-intl";
import { fromUnixTime, format } from "date-fns";
import { enUS, zhCN } from "date-fns/locale";
import {
  CaseSensitive,
  Check,
  ChevronLeft,
  ChevronRight,
  Cloud,
  Copy,
  GitBranch,
  LoaderCircle,
  RotateCcw,
  Tag,
} from "lucide-react";
import {
  Button,
  InputGroup,
  InputGroupButton,
  InputGroupInput,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@workspace/ui";
import { cn } from "@/shared/lib/utils";
import { copyToClipboard } from "@/shared/utils/copy";
import type { GitHistoryCommit, GitHistoryRef } from "@/api/ws-api-types";
import { useGitHistory } from "@/features/git/hooks/use-git-history";
import { useGitHistoryCenterTabStore } from "@/features/git/store/use-git-history-center-tab";
import { useGitStatusQuery } from "@/features/git/hooks/use-git-status-query";
import {
  TaskGithubDrawerHost,
  type TaskGithubDrawerController,
} from "@/features/task/components/task-github-drawer/TaskGithubDrawerHost";
import { commitDrawerKey } from "@/features/task/components/task-github-drawer/types";
import {
  HISTORY_GRAPH_ROW_OVERLAP,
  HISTORY_HEADER_HEIGHT,
  HISTORY_HEAD_RING_PADDING,
  HISTORY_NODE_RADIUS,
  HISTORY_ROW_HEIGHT,
  HISTORY_STROKE_WIDTH,
  GIT_HISTORY_GRAPH_COLORS,
  historyGraphColor,
  historyGraphWidth,
  historyLaneX,
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
import {
  collectGitHistoryMatchIndexes,
  splitHighlightedText,
} from "@/features/git/lib/git-history-search";

const MAX_VISIBLE_REFS = 3;
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

function GitHistoryTableHeader({
  columns,
  gridTemplate,
}: {
  columns: HistoryColumnWidths;
  gridTemplate: string;
}) {
  const t = useTranslations("git.history");
  return (
    <div
      className="sticky top-0 z-20 grid items-center border-b border-border/50 bg-background text-[10.5px] font-medium text-muted-foreground"
      style={{
        height: HISTORY_HEADER_HEIGHT,
        width: historyTableWidth(columns),
        gridTemplateColumns: gridTemplate,
      }}
    >
      {HISTORY_RESIZE_COLUMNS.map((id) => (
        <div key={id} className="min-w-0 px-1.5">
          <span className="block truncate">{t(`columns.${id}`)}</span>
        </div>
      ))}
      <div className="min-w-0 px-1.5">
        <span className="block truncate">{t("columns.commit")}</span>
      </div>
    </div>
  );
}

function ColumnResizeHandle({
  column,
  width,
  left,
  height,
  label,
  onResize,
}: {
  column: HistoryColumnId;
  width: number;
  left: number;
  height: number;
  label: string;
  onResize: (id: HistoryColumnId, nextWidth: number) => void;
}) {
  const drag = useRef<{ x: number; width: number } | null>(null);
  const [active, setActive] = useState(false);

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      tabIndex={0}
      style={{ left, height: Math.max(height, HISTORY_HEADER_HEIGHT) }}
      className={cn(
        "absolute top-0 w-2.5 -translate-x-1/2 cursor-col-resize touch-none select-none",
        "after:absolute after:inset-y-0 after:left-1/2 after:w-px after:-translate-x-1/2 after:transition-colors",
        active
          ? "after:bg-foreground/45"
          : "after:bg-transparent hover:after:bg-foreground/35",
      )}
      onPointerDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
        drag.current = { x: event.clientX, width };
        setActive(true);
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        if (!drag.current) return;
        onResize(column, drag.current.width + event.clientX - drag.current.x);
      }}
      onPointerUp={(event) => {
        drag.current = null;
        setActive(false);
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
      }}
      onPointerCancel={() => {
        drag.current = null;
        setActive(false);
      }}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          onResize(column, width - 16);
        } else if (event.key === "ArrowRight") {
          event.preventDefault();
          onResize(column, width + 16);
        }
      }}
    />
  );
}

function GitHistoryGraphSvg({
  rows,
  width,
}: {
  rows: ReturnType<typeof layoutGitHistoryGraph>["rows"];
  width: number;
}) {
  const height = rows.length * HISTORY_ROW_HEIGHT;
  const middle = HISTORY_ROW_HEIGHT / 2;
  const colorCount = GIT_HISTORY_GRAPH_COLORS.length;

  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute top-0 left-0 overflow-visible"
      width={width}
      height={height}
    >
      {Array.from({ length: colorCount }, (_, colorIndex) => {
        const d: string[] = [];
        for (let index = 0; index < rows.length; index++) {
          const row = rows[index]!;
          const originY = index * HISTORY_ROW_HEIGHT;
          for (const segment of row.segments) {
            if (segment.colorId % colorCount !== colorIndex) continue;
            const fromX = historyLaneX(segment.fromLane);
            const toX = historyLaneX(segment.toLane);
            if (segment.shape === "incoming") {
              d.push(
                `M ${fromX} ${originY - HISTORY_GRAPH_ROW_OVERLAP} C ${fromX} ${originY + middle * 0.55}, ${toX} ${originY + middle * 0.55}, ${toX} ${originY + middle}`,
              );
            } else if (segment.shape === "outgoing") {
              d.push(
                `M ${fromX} ${originY + middle} C ${fromX} ${originY + middle * 1.45}, ${toX} ${originY + middle * 1.45}, ${toX} ${originY + HISTORY_ROW_HEIGHT + HISTORY_GRAPH_ROW_OVERLAP}`,
              );
            } else if (segment.fromLane === segment.toLane) {
              d.push(
                `M ${fromX} ${originY - HISTORY_GRAPH_ROW_OVERLAP} L ${toX} ${originY + HISTORY_ROW_HEIGHT + HISTORY_GRAPH_ROW_OVERLAP}`,
              );
            } else {
              d.push(
                `M ${fromX} ${originY - HISTORY_GRAPH_ROW_OVERLAP} C ${fromX} ${originY + middle}, ${toX} ${originY + middle}, ${toX} ${originY + HISTORY_ROW_HEIGHT + HISTORY_GRAPH_ROW_OVERLAP}`,
              );
            }
          }
        }
        if (d.length === 0) return null;
        return (
          <path
            key={colorIndex}
            d={d.join(" ")}
            fill="none"
            stroke={historyGraphColor(colorIndex)}
            strokeWidth={HISTORY_STROKE_WIDTH}
          />
        );
      })}
    </svg>
  );
}

function HighlightedText({
  text,
  query,
  caseSensitive,
  className,
}: {
  text: string;
  query: string;
  caseSensitive: boolean;
  className?: string;
}) {
  const parts = splitHighlightedText(text, query, caseSensitive);
  return (
    <span className={className}>
      {parts.map((part, index) =>
        part.match ? (
          <mark key={`${part.text}-${index}`} className="rounded-sm bg-info/35 text-foreground">
            {part.text}
          </mark>
        ) : (
          <React.Fragment key={`${part.text}-${index}`}>{part.text}</React.Fragment>
        ),
      )}
    </span>
  );
}

function GitHistoryRow({
  commit,
  columns,
  gridTemplate,
  nodeLane,
  nodeColorId,
  isHead,
  selected,
  matched,
  query,
  caseSensitive,
  onSelect,
}: {
  commit: GitHistoryCommit;
  columns: HistoryColumnWidths;
  gridTemplate: string;
  nodeLane: number;
  nodeColorId: number;
  isHead: boolean;
  selected: boolean;
  matched: boolean;
  query: string;
  caseSensitive: boolean;
  onSelect: () => void;
}) {
  const t = useTranslations("git.history");
  const locale = useLocale();
  const dateLocale = locale.startsWith("zh") ? zhCN : enUS;
  const [copied, setCopied] = useState(false);
  const color = historyGraphColor(nodeColorId);
  const nodeX = historyLaneX(nodeLane);
  const dateLabel = format(fromUnixTime(commit.timestamp), "d MMM yyyy HH:mm", {
    locale: dateLocale,
  });
  const visibleRefs = commit.refs.slice(0, MAX_VISIBLE_REFS);
  const hiddenRefCount = Math.max(0, commit.refs.length - visibleRefs.length);
  const subject = commit.subject.trim() ? commit.subject : t("noSubject");

  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
      className={cn(
        "grid h-9 cursor-pointer items-center border-b border-border/40 text-[11px] hover:bg-muted/40",
        matched && !selected && "bg-info/10",
        selected && "bg-muted/50",
      )}
      style={{
        width: historyTableWidth(columns),
        gridTemplateColumns: gridTemplate,
      }}
    >
      <div className="relative h-full min-w-0">
        {isHead ? (
          <span
            className="absolute rounded-full border bg-background"
            style={{
              left: nodeX - HISTORY_NODE_RADIUS - HISTORY_HEAD_RING_PADDING,
              top:
                HISTORY_ROW_HEIGHT / 2 -
                HISTORY_NODE_RADIUS -
                HISTORY_HEAD_RING_PADDING,
              width: (HISTORY_NODE_RADIUS + HISTORY_HEAD_RING_PADDING) * 2,
              height: (HISTORY_NODE_RADIUS + HISTORY_HEAD_RING_PADDING) * 2,
              borderColor: color,
            }}
          />
        ) : null}
        <span
          className="absolute rounded-full"
          style={{
            left: nodeX - HISTORY_NODE_RADIUS,
            top: HISTORY_ROW_HEIGHT / 2 - HISTORY_NODE_RADIUS,
            width: HISTORY_NODE_RADIUS * 2,
            height: HISTORY_NODE_RADIUS * 2,
            backgroundColor: color,
          }}
        />
      </div>

      <div className="flex min-w-0 items-center overflow-hidden px-1.5">
        {visibleRefs.length > 0 ? (
          <span className="mr-1.5 flex min-w-0 max-w-[70%] items-center gap-1 overflow-hidden">
            {visibleRefs.map((reference) => (
              <HistoryRefBadge
                key={`${reference.kind}:${reference.label}`}
                reference={reference}
                query={query}
                caseSensitive={caseSensitive}
              />
            ))}
            {hiddenRefCount > 0 ? (
              <span className="shrink-0 text-[10px] text-muted-foreground">
                +{hiddenRefCount}
              </span>
            ) : null}
          </span>
        ) : null}
        <HighlightedText
          text={subject}
          query={query}
          caseSensitive={caseSensitive}
          className="min-w-0 flex-1 truncate text-xs text-foreground"
        />
      </div>

      <span className="min-w-0 truncate px-1.5 text-[10.5px] text-muted-foreground">
        {dateLabel}
      </span>
      <span className="min-w-0 truncate px-1.5 text-muted-foreground">
        <HighlightedText
          text={commit.author_name || t("unknownAuthor")}
          query={query}
          caseSensitive={caseSensitive}
        />
      </span>
      <div className="group/hash flex min-w-0 items-center justify-start gap-1 px-1.5 font-mono text-[10.5px] text-muted-foreground">
        <span className="min-w-0 truncate">
          {copied ? (
            <span className="text-info">{t("copied")}</span>
          ) : (
            <HighlightedText
              text={commit.short_hash}
              query={query}
              caseSensitive={caseSensitive}
            />
          )}
        </span>
        <button
          type="button"
          aria-label={t("copyHash")}
          title={t("copyHash")}
          className={cn(
            "inline-flex size-5 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-colors hover:bg-accent hover:text-foreground group-hover/hash:opacity-100",
            copied && "opacity-100 text-info",
          )}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            void copyToClipboard(commit.hash).then((ok) => {
              if (!ok) return;
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1200);
            });
          }}
        >
          {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
        </button>
      </div>
    </div>
  );
}

function HistoryRefBadge({
  reference,
  query,
  caseSensitive,
}: {
  reference: GitHistoryRef;
  query: string;
  caseSensitive: boolean;
}) {
  const Icon =
    reference.kind === "branch"
      ? GitBranch
      : reference.kind === "tag"
        ? Tag
        : Cloud;
  const tone =
    reference.kind === "branch"
      ? "text-info bg-info/10"
      : reference.kind === "tag"
        ? "text-warning bg-warning/10"
        : "text-muted-foreground bg-muted/60";
  const labelRef = useRef<HTMLSpanElement>(null);
  const [truncated, setTruncated] = useState(false);
  const [tooltipOpen, setTooltipOpen] = useState(false);

  useLayoutEffect(() => {
    const label = labelRef.current;
    if (!label) return;
    const measure = () => {
      const nextTruncated = label.scrollWidth > label.clientWidth + 1;
      setTruncated(nextTruncated);
      if (!nextTruncated) setTooltipOpen(false);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(label);
    return () => observer.disconnect();
  }, [caseSensitive, query, reference.label]);

  return (
    <Tooltip
      open={truncated ? tooltipOpen : false}
      onOpenChange={(next) => {
        if (truncated) setTooltipOpen(next);
      }}
    >
      <TooltipTrigger asChild>
        <span
          className={cn(
            "inline-flex min-w-0 max-w-56 items-center gap-0.5 rounded-sm px-1 py-0.5 text-[10px]",
            tone,
          )}
        >
          <Icon className="size-2.5 shrink-0" />
          <span ref={labelRef} className="truncate">
            <HighlightedText
              text={reference.label}
              query={query}
              caseSensitive={caseSensitive}
            />
          </span>
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs break-all">
        {reference.label}
      </TooltipContent>
    </Tooltip>
  );
}
