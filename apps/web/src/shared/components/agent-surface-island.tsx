"use client";

import * as React from "react";
import { useLocale } from "next-intl";
import { AnimatePresence, motion } from "motion/react";
import {
  Camera,
  Eye,
  LayoutGrid,
  Maximize2,
  MousePointer2,
  Move,
  Pencil,
  Plus,
  Trash2,
  Type,
} from "lucide-react";
import { BorderBeam, cn, DotmSquare12, TextShimmer } from "@workspace/ui";

import { ImagePreviewOverlay } from "@/shared/components/image-preview-overlay";
import {
  AGENT_SURFACE_FEED_STALE_MS,
  type AgentSurfaceFeedBatch,
  type AgentSurfaceFeedEntry,
  type AgentSurfaceFeedSnapshot,
  type AgentSurfaceFeedStore,
} from "@/shared/lib/agent-surface-feed";
import {
  summarizeConsecutiveEntries,
  type SummarizedFeedRow,
} from "@/shared/lib/agent-surface-feed-summarize";
import {
  resolveAgentSurfaceIslandWorking,
  type AgentSurfaceViewState,
} from "@/shared/lib/agent-surface-activity";

const PANEL_TRANSITION = {
  duration: 0.24,
  ease: [0.22, 1, 0.36, 1] as const,
};

const GLASS_SHELL = cn(
  "border shadow-lg",
  "bg-background/50 text-foreground backdrop-blur-2xl backdrop-saturate-150",
  "border-border/50",
  "dark:bg-background/40 dark:border-border/40",
);

const MAX_HISTORY_ROWS = 100;
const ISLAND_ACTIVE_WINDOW_MS = 15_000;

export type AgentSurfaceIslandCopy = {
  workingAria: string;
  idleAria: string;
  historyAria: string;
  openScreenshotPreview: string;
  screenshotPreviewAlt: string;
};

export type AgentSurfaceIslandProps = {
  acceptsCommands: boolean;
  feed: AgentSurfaceFeedStore;
  viewState: AgentSurfaceViewState;
  lastActivityAt: number | null;
  copy: AgentSurfaceIslandCopy;
};

function formatTime(at: number, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(at));
}

function formatRowLabel(row: SummarizedFeedRow): string {
  return row.count > 1 ? `${row.label} ×${row.count}` : row.label;
}

function buildVisibleHistoryBatches(batches: AgentSurfaceFeedBatch[]) {
  const visibleBatches: Array<{
    id: string;
    showDivider: boolean;
    rows: SummarizedFeedRow[];
  }> = [];
  let remainingRows = MAX_HISTORY_ROWS;

  [...batches].reverse().forEach((batch, batchIndex) => {
    if (remainingRows <= 0) return;

    const rows = summarizeConsecutiveEntries([...batch.entries].reverse());
    const visibleRows = rows.slice(0, remainingRows);
    if (visibleRows.length === 0) return;

    remainingRows -= visibleRows.length;
    visibleBatches.push({
      id: batch.id,
      showDivider: batchIndex > 0,
      rows: visibleRows,
    });
  });

  return visibleBatches;
}

export function AgentSurfaceIsland({
  acceptsCommands,
  feed,
  viewState,
  lastActivityAt,
  copy,
}: AgentSurfaceIslandProps) {
  const snapshot = useFeedSnapshot(feed);
  const [expanded, setExpanded] = React.useState(false);
  const islandRef = React.useRef<HTMLDivElement>(null);
  const current = React.useMemo(
    () => pickCurrentEntry(snapshot, viewState.inflight),
    [snapshot, viewState.inflight],
  );
  const reducedMotion = usePrefersReducedMotion();
  const recentlyActive = useTimeWindow(lastActivityAt, ISLAND_ACTIVE_WINDOW_MS);
  const isWorking = resolveAgentSurfaceIslandWorking(
    viewState,
    recentlyActive,
    current?.status === "active",
  );

  React.useEffect(() => {
    const tick = () => {
      feed.expireStaleActive(AGENT_SURFACE_FEED_STALE_MS);
    };
    tick();
    const id = window.setInterval(tick, 4_000);
    return () => window.clearInterval(id);
  }, [feed]);

  useDismissOnOutsidePress(islandRef, expanded, () => setExpanded(false));

  if (!acceptsCommands || snapshot.batches.length === 0 || !current) {
    return null;
  }

  return (
    <div
      ref={islandRef}
      className="pointer-events-none absolute bottom-4 right-4 z-[60] flex max-w-[min(100%,22rem)] flex-col items-end gap-2"
    >
      <AnimatePresence>
        {expanded ? (
          <motion.div
            key="agent-surface-island-panel"
            initial={{ opacity: 0, y: 8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.98 }}
            transition={PANEL_TRANSITION}
            className="pointer-events-auto w-[min(100vw-2rem,20rem)]"
          >
            <ExpandedPanel
              batches={snapshot.batches}
              shimmerEntryId={
                isWorking ? (snapshot.activeEntryId ?? current.requestId) : snapshot.activeEntryId
              }
              reducedMotion={reducedMotion}
              copy={copy}
            />
          </motion.div>
        ) : null}
      </AnimatePresence>

      <BorderBeam
        size="md"
        colorVariant="ocean"
        borderRadius={9999}
        active={isWorking}
        className="pointer-events-auto [&>[data-beam-bloom]]:pointer-events-none"
      >
        <button
          type="button"
          aria-expanded={expanded}
          aria-label={isWorking ? copy.workingAria : copy.idleAria}
          onClick={() => setExpanded((v) => !v)}
          className={cn(
            "flex h-8 max-w-[min(100%,20rem)] items-center gap-2 rounded-full py-0 pl-2.5 pr-3",
            "transition-[transform,box-shadow] duration-200 ease-out",
            "hover:scale-[1.02] active:scale-[0.98]",
            GLASS_SHELL,
          )}
        >
          <DotmSquare12
            size={16}
            dotSize={2.5}
            animated={isWorking && !reducedMotion}
            className="size-4 shrink-0"
          />
          <IslandStatusLabel
            labelKey={`${current.requestId}:${isWorking ? "work" : "idle"}`}
            label={current.label}
            isWorking={isWorking && !reducedMotion}
          />
        </button>
      </BorderBeam>
    </div>
  );
}

function ExpandedPanel({
  batches,
  shimmerEntryId,
  reducedMotion,
  copy,
}: {
  batches: AgentSurfaceFeedBatch[];
  shimmerEntryId: string | null;
  reducedMotion: boolean;
  copy: AgentSurfaceIslandCopy;
}) {
  const visibleBatches = buildVisibleHistoryBatches(batches);

  return (
    <div
      role="dialog"
      aria-label={copy.historyAria}
      className={cn("overflow-hidden rounded-2xl", GLASS_SHELL)}
    >
      <div className="max-h-64 overflow-y-auto overscroll-contain px-3 py-2">
        {visibleBatches.map((batch) => (
          <React.Fragment key={batch.id}>
            {batch.showDivider ? (
              <div className="my-2 border-t border-dashed border-border/60" aria-hidden />
            ) : null}
            <ul className="flex flex-col gap-1">
              {batch.rows.map((row) => {
                const wantsShimmer = row.id === shimmerEntryId || row.status === "active";
                return (
                  <HistoryRow
                    key={row.id}
                    row={row}
                    shimmer={wantsShimmer && !reducedMotion}
                    copy={copy}
                  />
                );
              })}
            </ul>
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

function HistoryRow({
  row,
  shimmer,
  copy,
}: {
  row: SummarizedFeedRow;
  shimmer: boolean;
  copy: AgentSurfaceIslandCopy;
}) {
  const locale = useLocale();
  const [previewOpen, setPreviewOpen] = React.useState(false);
  const shot = row.screenshot?.dataUrl ? row.screenshot : null;
  const label = formatRowLabel(row);

  return (
    <li className="flex items-center gap-2 rounded-lg px-1 py-1.5 text-xs">
      <HistoryIcon
        row={row}
        className={cn(
          "size-3.5 shrink-0",
          row.status === "error"
            ? "text-destructive"
            : shimmer
              ? "text-emerald-500"
              : "text-muted-foreground",
        )}
      />
      <span
        className={cn(
          "min-w-0 flex-1 truncate",
          shimmer ? "text-foreground" : "text-foreground/85",
        )}
      >
        {shimmer ? (
          <TextShimmer as="span" duration={1.5} className="block truncate text-xs font-medium">
            {label}
          </TextShimmer>
        ) : (
          <span className="truncate">{label}</span>
        )}
      </span>
      {shot ? (
        <button
          type="button"
          aria-label={copy.openScreenshotPreview}
          title={copy.openScreenshotPreview}
          onClick={(e) => {
            e.stopPropagation();
            setPreviewOpen(true);
          }}
          className={cn(
            "size-7 shrink-0 overflow-hidden rounded-md border border-border/60 bg-muted/40",
            "cursor-zoom-in transition-opacity hover:opacity-90",
          )}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={shot.dataUrl}
            alt={copy.screenshotPreviewAlt}
            width={shot.width || 28}
            height={shot.height || 28}
            className="size-full object-cover object-top"
            draggable={false}
          />
        </button>
      ) : null}
      <time
        className="shrink-0 tabular-nums text-[10px] text-muted-foreground"
        dateTime={new Date(row.time).toISOString()}
      >
        {formatTime(row.time, locale)}
      </time>
      {previewOpen && shot ? (
        <ImagePreviewOverlay
          src={shot.dataUrl}
          alt={copy.screenshotPreviewAlt}
          onClose={() => setPreviewOpen(false)}
        />
      ) : null}
    </li>
  );
}

function isScreenshotRow(row: SummarizedFeedRow): boolean {
  if (row.screenshot?.dataUrl) return true;
  const command = (row.command ?? "").trim().toLowerCase().replace(/_/g, "-");
  return command === "screenshot" || command === "pt-screenshot";
}

function HistoryIcon({
  className,
  row,
}: {
  className?: string;
  row: SummarizedFeedRow;
}) {
  if (isScreenshotRow(row)) return <Camera className={className} aria-hidden />;
  if (row.label.includes("writing")) return <Type className={className} aria-hidden />;

  switch (row.kind) {
    case "read":
      return <Eye className={className} aria-hidden />;
    case "create":
      return <Plus className={className} aria-hidden />;
    case "edit":
      return <Pencil className={className} aria-hidden />;
    case "delete":
      return <Trash2 className={className} aria-hidden />;
    case "move":
      return <Move className={className} aria-hidden />;
    case "layout":
      return <LayoutGrid className={className} aria-hidden />;
    case "navigate":
      return <Maximize2 className={className} aria-hidden />;
    case "select":
      return <MousePointer2 className={className} aria-hidden />;
    default:
      return <Type className={className} aria-hidden />;
  }
}

function IslandStatusLabel({
  labelKey,
  label,
  isWorking,
}: {
  labelKey: string;
  label: string;
  isWorking: boolean;
}) {
  return (
    <span
      key={labelKey}
      className="block max-w-[14rem] truncate whitespace-nowrap text-sm font-medium"
      aria-live="polite"
      aria-atomic
    >
      {isWorking ? (
        <TextShimmer as="span" duration={1.5} className="text-sm font-medium">
          {label}
        </TextShimmer>
      ) : (
        <span className="opacity-90">{label}</span>
      )}
    </span>
  );
}

function useTimeWindow(at: number | null, windowMs: number): boolean {
  const [active, setActive] = React.useState(false);
  React.useEffect(() => {
    if (at === null) {
      setActive(false);
      return;
    }
    const remaining = at + windowMs - Date.now();
    if (remaining <= 0) {
      setActive(false);
      return;
    }
    setActive(true);
    const id = window.setTimeout(() => setActive(false), remaining);
    return () => window.clearTimeout(id);
  }, [at, windowMs]);
  return active;
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = React.useState(false);
  React.useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return reduced;
}

function useDismissOnOutsidePress(
  rootRef: React.RefObject<HTMLDivElement | null>,
  enabled: boolean,
  onDismiss: () => void,
) {
  React.useEffect(() => {
    if (!enabled) return;

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      const root = rootRef.current;
      if (!root || root.contains(target)) return;
      if (target instanceof Element && target.closest("[data-image-preview-overlay]")) {
        return;
      }
      onDismiss();
    };

    const frame = requestAnimationFrame(() => {
      document.addEventListener("pointerdown", onPointerDown, true);
    });

    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [enabled, onDismiss, rootRef]);
}

function pickCurrentEntry(
  snapshot: AgentSurfaceFeedSnapshot,
  inflight: boolean,
): AgentSurfaceFeedEntry | null {
  if (inflight && snapshot.activeEntryId) {
    for (const batch of snapshot.batches) {
      for (const entry of batch.entries) {
        if (entry.requestId === snapshot.activeEntryId && entry.status === "active") {
          return entry;
        }
      }
    }
  }
  for (let b = snapshot.batches.length - 1; b >= 0; b -= 1) {
    const batch = snapshot.batches[b];
    if (!batch) continue;
    for (let e = batch.entries.length - 1; e >= 0; e -= 1) {
      const entry = batch.entries[e];
      if (entry) return entry;
    }
  }
  return null;
}

function useFeedSnapshot(store: AgentSurfaceFeedStore) {
  return React.useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}
