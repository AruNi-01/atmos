"use client";

import React, { useLayoutEffect, useRef, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { fromUnixTime, format } from "date-fns";
import { enUS, zhCN } from "date-fns/locale";
import { Check, Cloud, Copy, GitBranch, Tag } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@workspace/ui";
import { cn } from "@/shared/lib/utils";
import { copyToClipboard } from "@/shared/utils/copy";
import type { GitHistoryCommit, GitHistoryRef } from "@/api/ws-api-types";
import {
  HISTORY_HEAD_RING_PADDING,
  HISTORY_NODE_RADIUS,
  HISTORY_ROW_HEIGHT,
  historyGraphColor,
  historyLaneX,
} from "@/features/git/lib/git-history-graph";
import {
  historyTableWidth,
  type HistoryColumnWidths,
} from "@/features/git/lib/git-history-columns";
import { splitHighlightedText } from "@/features/git/lib/git-history-search";

const MAX_VISIBLE_REFS = 3;

export function HighlightedText({
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

export function GitHistoryRow({
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
