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
  ChevronLeft,
  ChevronRight,
  Cloud,
  GitBranch,
  LoaderCircle,
  RotateCcw,
  Tag,
} from "lucide-react";
import { Button, Input } from "@workspace/ui";
import { cn } from "@/shared/lib/utils";
import { copyToClipboard } from "@/shared/utils/copy";
import type { GitHistoryCommit, GitHistoryRef } from "@/api/ws-api-types";
import { useGitHistory } from "@/features/git/hooks/use-git-history";
import { useGitHistoryCenterTabStore } from "@/features/git/store/use-git-history-center-tab";
import {
  HISTORY_GRAPH_ROW_OVERLAP,
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
  const selectedHash = useGitHistoryCenterTabStore(
    (state) => state.selectedCommitByContext[contextId] ?? null,
  );
  const selectCommit = useGitHistoryCenterTabStore((state) => state.selectCommit);
  const layout = useMemo(
    () => layoutGitHistoryGraph(history.commits, history.headSha),
    [history.commits, history.headSha],
  );
  const graphWidth = historyGraphWidth(layout.maxLaneCount);
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
      <div className="flex h-10 shrink-0 items-center gap-1.5 border-b border-border/60 px-2">
        <div className="flex h-7 min-w-0 flex-1 items-center rounded-md border border-border/80 bg-background pr-0.5">
          <Input
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
            className="h-7 min-w-0 flex-1 border-0 bg-transparent shadow-none focus-visible:ring-0"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-pressed={caseSensitive}
            aria-label={t("matchCase")}
            title={t("matchCase")}
            className={cn(caseSensitive && "bg-accent text-foreground")}
            onClick={() => setCaseSensitive((current) => !current)}
          >
            <CaseSensitive className="size-3.5" />
          </Button>
        </div>
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
              history.isFetching && !history.isFetchingNextPage && "animate-spin",
            )}
          />
        </Button>
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto">
        <div
          className="relative"
          style={{
            minWidth: graphWidth + 420,
            height: virtualizer.getTotalSize(),
          }}
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
                width={graphWidth}
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
                className="absolute top-0 right-0 left-0"
                style={{
                  height: HISTORY_ROW_HEIGHT,
                  transform: `translateY(${item.start}px)`,
                }}
              >
                <GitHistoryRow
                  commit={commit}
                  graphWidth={graphWidth}
                  nodeLane={row.nodeLane}
                  nodeColorId={row.nodeColorId}
                  isHead={row.isHead}
                  selected={selectedHash === commit.hash}
                  matched={activeQuery.length > 0 && matchIndexSet.has(item.index)}
                  query={activeQuery}
                  caseSensitive={caseSensitive}
                  onSelect={() => selectCommit(contextId, commit.hash)}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
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
  graphWidth,
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
  graphWidth: number;
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
      className={cn(
        "flex h-9 w-full items-center border-b border-border/40 text-[11px] transition-colors hover:bg-muted/40",
        matched && !selected && "bg-info/10",
        selected && "bg-muted/50",
      )}
    >
      <button
        type="button"
        aria-pressed={selected}
        onClick={onSelect}
        className="flex h-full min-w-0 flex-1 cursor-pointer items-center text-left"
      >
        <div className="relative h-full shrink-0" style={{ width: graphWidth }}>
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

        {visibleRefs.length > 0 ? (
          <span className="mr-2 flex min-w-0 shrink-0 items-center gap-1">
            {visibleRefs.map((reference) => (
              <HistoryRefBadge
                key={`${reference.kind}:${reference.label}`}
                reference={reference}
                query={query}
                caseSensitive={caseSensitive}
              />
            ))}
            {hiddenRefCount > 0 ? (
              <span className="text-[10px] text-muted-foreground">+{hiddenRefCount}</span>
            ) : null}
          </span>
        ) : null}

        <HighlightedText
          text={subject}
          query={query}
          caseSensitive={caseSensitive}
          className="min-w-20 flex-1 truncate pr-2 text-xs text-foreground"
        />

        <span className="w-[132px] shrink-0 truncate pr-2 text-[10.5px] text-muted-foreground">
          {dateLabel}
        </span>
        <HighlightedText
          text={commit.author_name || t("unknownAuthor")}
          query={query}
          caseSensitive={caseSensitive}
          className="w-[100px] shrink-0 truncate pr-2 text-muted-foreground"
        />
      </button>
      <button
        type="button"
        title={commit.hash}
        aria-label={t("copyHash")}
        className={cn(
          "mr-1.5 flex h-6 w-[72px] shrink-0 items-center rounded-sm px-1 font-mono text-[10.5px] text-muted-foreground hover:bg-muted",
          copied && "text-info",
        )}
        onClick={() => {
          void copyToClipboard(commit.hash).then((ok) => {
            if (!ok) return;
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1200);
          });
        }}
      >
        {copied ? (
          t("copied")
        ) : (
          <HighlightedText
            text={commit.short_hash}
            query={query}
            caseSensitive={caseSensitive}
          />
        )}
      </button>
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

  return (
    <span
      className={cn(
        "inline-flex max-w-28 items-center gap-0.5 rounded-sm px-1 py-0.5 text-[10px]",
        tone,
      )}
    >
      <Icon className="size-2.5 shrink-0" />
      <HighlightedText
        text={reference.label}
        query={query}
        caseSensitive={caseSensitive}
        className="truncate"
      />
    </span>
  );
}
