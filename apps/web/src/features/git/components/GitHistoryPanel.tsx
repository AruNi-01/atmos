"use client";

import React, { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { fromUnixTime, format } from "date-fns";
import {
  Cloud,
  GitBranch,
  LoaderCircle,
  RotateCcw,
  Tag,
} from "lucide-react";
import { Button } from "@workspace/ui";
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

const MAX_VISIBLE_REFS = 3;

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
      <div className="flex h-8 shrink-0 items-center justify-end border-b border-border/60 px-2">
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

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="relative" style={{ minWidth: graphWidth + 320 }}>
          <GitHistoryGraphSvg rows={layout.rows} width={graphWidth} />
          {history.commits.map((commit, index) => {
            const row = layout.rows[index];
            if (!row) return null;
            return (
              <GitHistoryRow
                key={commit.hash}
                commit={commit}
                graphWidth={graphWidth}
                nodeLane={row.nodeLane}
                nodeColorId={row.nodeColorId}
                isHead={row.isHead}
                selected={selectedHash === commit.hash}
                onSelect={() => selectCommit(contextId, commit.hash)}
              />
            );
          })}
        </div>

        {history.hasNextPage ? (
          <div className="flex h-12 items-center justify-center">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 px-2.5 text-[11px]"
              disabled={history.isFetchingNextPage}
              onClick={() => void history.fetchNextPage()}
            >
              {history.isFetchingNextPage ? (
                <LoaderCircle className="size-3 animate-spin" />
              ) : null}
              {t("loadMore")}
            </Button>
          </div>
        ) : null}
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

function GitHistoryRow({
  commit,
  graphWidth,
  nodeLane,
  nodeColorId,
  isHead,
  selected,
  onSelect,
}: {
  commit: GitHistoryCommit;
  graphWidth: number;
  nodeLane: number;
  nodeColorId: number;
  isHead: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  const t = useTranslations("git.history");
  const [copied, setCopied] = useState(false);
  const color = historyGraphColor(nodeColorId);
  const nodeX = historyLaneX(nodeLane);
  const dateLabel = format(fromUnixTime(commit.timestamp), "MMM d, yyyy");
  const visibleRefs = commit.refs.slice(0, MAX_VISIBLE_REFS);
  const hiddenRefCount = Math.max(0, commit.refs.length - visibleRefs.length);
  const subject = commit.subject.trim() ? commit.subject : t("noSubject");

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        onSelect();
      }}
      className={cn(
        "flex h-9 w-full cursor-pointer items-center border-b border-border/40 text-left text-[11px] transition-colors hover:bg-muted/40",
        selected && "bg-muted/50",
      )}
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

      <span className="min-w-20 flex-1 truncate pr-2 text-xs text-foreground">
        {subject}
      </span>

      {visibleRefs.length > 0 ? (
        <span className="mr-2 flex min-w-0 shrink-0 items-center gap-1">
          {visibleRefs.map((reference) => (
            <HistoryRefBadge
              key={`${reference.kind}:${reference.label}`}
              reference={reference}
            />
          ))}
          {hiddenRefCount > 0 ? (
            <span className="text-[10px] text-muted-foreground">+{hiddenRefCount}</span>
          ) : null}
        </span>
      ) : null}

      <span className="w-[88px] shrink-0 truncate pr-2 text-muted-foreground">
        {commit.author_name || t("unknownAuthor")}
      </span>
      <span className="w-[88px] shrink-0 truncate pr-2 text-[10.5px] text-muted-foreground">
        {dateLabel}
      </span>
      <button
        type="button"
        title={commit.hash}
        className={cn(
          "mr-1.5 flex h-6 w-[68px] shrink-0 items-center rounded-sm px-1 font-mono text-[10.5px] text-muted-foreground hover:bg-muted",
          copied && "text-info",
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
        {copied ? t("copied") : commit.short_hash}
      </button>
    </div>
  );
}

function HistoryRefBadge({ reference }: { reference: GitHistoryRef }) {
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
      <span className="truncate">{reference.label}</span>
    </span>
  );
}
