"use client";

import * as React from "react";
import { useLocale, useTranslations } from "next-intl";
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
import { cn, DotmSquare12, TextShimmer } from "@workspace/ui";

import type { CanvasAgentFeedStore } from "../lib/canvas-agent-feed";
import type {
  CanvasAgentFeedBatch,
  CanvasAgentFeedEntry,
  CanvasAgentFeedSnapshot,
} from "../lib/canvas-agent-feed";
import {
  summarizeConsecutiveEntries,
  type SummarizedFeedRow,
} from "../lib/canvas-agent-feed-summarize";
import { CANVAS_AGENT_FEED_STALE_MS } from "../lib/canvas-agent-feed";
import {
  type CanvasAgentViewState,
  resolveCanvasAgentIslandWorking,
} from "../lib/canvas-agent-activity";
import type { CanvasAgentBridgeState } from "../hooks/use-canvas-agent-bridge";
import { ImagePreviewOverlay } from "@/shared/components/image-preview-overlay";

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

/**
 * Window during which the island stays in "working" mode (animated icon +
 * shimmering text) after the last successful agent dispatch. Uses the same
 * "refresh-on-activity" pattern as the top-right Agent menu green dot
 * (`CanvasAgentOverlay.ACTIVE_WINDOW_MS = 30s`), but with a shorter 15s
 * window — the island sits closer to the action and a tighter window feels
 * less stale once the agent goes quiet.
 */
const ISLAND_ACTIVE_WINDOW_MS = 15_000;

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

function buildVisibleHistoryBatches(batches: CanvasAgentFeedBatch[]) {
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

export function CanvasAgentIsland({ bridge }: { bridge: CanvasAgentBridgeState }) {
  const t = useTranslations("Canvas.chrome");
  const snapshot = useFeedSnapshot(bridge.feed);
  const viewState = useAgentViewState(bridge.activity);
  const [expanded, setExpanded] = React.useState(false);
  const islandRef = React.useRef<HTMLDivElement>(null);
  const current = React.useMemo(
    () => pickCurrentEntry(snapshot, viewState.inflight),
    [snapshot, viewState.inflight],
  );
  const reducedMotion = usePrefersReducedMotion();

  // Match the top-right Agent menu green dot: stay in "working" mode whenever
  // the agent is mid-dispatch OR has finished a dispatch within
  // ISLAND_ACTIVE_WINDOW_MS. Individual fast canvas commands resolve in a
  // microtask (React batches begin+end into one render so a per-dispatch
  // `inflight` toggle would never paint), but `activity.at` is bumped on every
  // successful dispatch, so an active agent burst keeps refreshing the window
  // and the icon ripple + shimmer keep running until the agent goes quiet.
  const lastActivityAt = useAgentLastActivityAt(bridge.activity);
  const recentlyActive = useTimeWindow(lastActivityAt, ISLAND_ACTIVE_WINDOW_MS);
  const isWorking = resolveCanvasAgentIslandWorking(
    viewState,
    recentlyActive,
    current?.status === "active",
  );

  React.useEffect(() => {
    const tick = () => {
      bridge.feed.expireStaleActive(CANVAS_AGENT_FEED_STALE_MS);
    };
    tick();
    const id = window.setInterval(tick, 4_000);
    return () => window.clearInterval(id);
  }, [bridge.feed]);

  useDismissOnOutsidePress(islandRef, expanded, () => setExpanded(false));

  if (!bridge.acceptsCommands || snapshot.batches.length === 0 || !current) {
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
            key="canvas-agent-island-panel"
            initial={{ opacity: 0, y: 8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.98 }}
            transition={PANEL_TRANSITION}
            className="pointer-events-auto w-[min(100vw-2rem,20rem)]"
          >
            <ExpandedPanel
              batches={snapshot.batches}
              // While the island is in "working" mode, shimmer the current
              // doing row even if the entry just flipped to done (15s window).
              shimmerEntryId={
                isWorking
                  ? (snapshot.activeEntryId ?? current.requestId)
                  : snapshot.activeEntryId
              }
              reducedMotion={reducedMotion}
            />
          </motion.div>
        ) : null}
      </AnimatePresence>

      <button
        type="button"
        aria-expanded={expanded}
        aria-label={
          isWorking
            ? t("agentIsland.agentWorkingOnCanvas")
            : t("agentIsland.canvasAgentActivity")
        }
        onClick={() => setExpanded(v => !v)}
        className={cn(
          "pointer-events-auto flex h-8 max-w-[min(100%,20rem)] items-center gap-2 rounded-full py-0 pl-2.5 pr-3",
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
    </div>
  );
}

function ExpandedPanel({
  batches,
  shimmerEntryId,
  reducedMotion,
}: {
  batches: CanvasAgentFeedBatch[];
  shimmerEntryId: string | null;
  reducedMotion: boolean;
}) {
  const t = useTranslations("Canvas.chrome");
  const visibleBatches = buildVisibleHistoryBatches(batches);

  return (
    <div
      role="dialog"
      aria-label={t("agentIsland.canvasAgentActivityHistory")}
      className={cn("overflow-hidden rounded-2xl", GLASS_SHELL)}
    >
      <div className="max-h-64 overflow-y-auto overscroll-contain px-3 py-2">
        {visibleBatches.map((batch) => (
          <React.Fragment key={batch.id}>
            {batch.showDivider ? (
              <div className="my-2 border-t border-dashed border-border/60" aria-hidden />
            ) : null}
            <ul className="flex flex-col gap-1">
              {batch.rows.map(row => {
                const wantsShimmer =
                  row.id === shimmerEntryId || row.status === "active";
                return (
                  <HistoryRow
                    key={row.id}
                    row={row}
                    shimmer={wantsShimmer && !reducedMotion}
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
}: {
  row: SummarizedFeedRow;
  shimmer: boolean;
}) {
  const locale = useLocale();
  const t = useTranslations("Canvas.chrome");
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
          // Keep truncate in both states so long labels never cover the
          // screenshot control / timestamp while shimmering.
          "min-w-0 flex-1 truncate",
          shimmer ? "text-foreground" : "text-foreground/85",
        )}
      >
        {shimmer ? (
          <TextShimmer
            as="span"
            duration={1.5}
            className="block truncate text-xs font-medium"
          >
            {label}
          </TextShimmer>
        ) : (
          <span className="truncate">{label}</span>
        )}
      </span>
      {shot ? (
        <button
          type="button"
          aria-label={t("agentIsland.openScreenshotPreview")}
          title={t("agentIsland.openScreenshotPreview")}
          onClick={e => {
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
            alt={t("agentIsland.screenshotPreviewAlt")}
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
          alt={t("agentIsland.screenshotPreviewAlt")}
          onClose={() => setPreviewOpen(false)}
        />
      ) : null}
    </li>
  );
}

function isScreenshotRow(row: SummarizedFeedRow): boolean {
  if (row.screenshot?.dataUrl) return true;
  const command = (row.command ?? "").trim().toLowerCase().replace(/_/g, "-");
  return command === "screenshot";
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

/**
 * Label slot — TextShimmer matches Footer / AgentActivityIndicator.
 * Do not wrap TextShimmer in motion/AnimatePresence (see HostedAppShellGate).
 */
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

/** Timestamp (`Date.now()`) of the most recent successful agent dispatch. */
function useAgentLastActivityAt(
  store: CanvasAgentBridgeState["activity"],
): number | null {
  return React.useSyncExternalStore(
    store.subscribe,
    () => store.getSnapshot()?.at ?? null,
    () => store.getSnapshot()?.at ?? null,
  );
}

/**
 * Returns `true` for `windowMs` after `at`, mirroring the green-dot logic in
 * `CanvasAgentOverlay`. Re-arms whenever `at` updates so an active agent burst
 * keeps the window open.
 */
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
      // Image preview is portaled to document.body — closing it must not
      // collapse the Island history popover.
      if (
        target instanceof Element &&
        target.closest("[data-image-preview-overlay]")
      ) {
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
  snapshot: CanvasAgentFeedSnapshot,
  inflight: boolean,
): CanvasAgentFeedEntry | null {
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

function useFeedSnapshot(store: CanvasAgentFeedStore) {
  return React.useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}

function useAgentViewState(store: CanvasAgentBridgeState["activity"]): CanvasAgentViewState {
  return React.useSyncExternalStore(store.subscribe, store.getViewState, store.getViewState);
}
