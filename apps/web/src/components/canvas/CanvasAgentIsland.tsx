"use client";

import * as React from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  Eye,
  LayoutGrid,
  Maximize2,
  MousePointer2,
  Move,
  Pencil,
  Plus,
  Trash2,
  Type,
  type LucideIcon,
} from "lucide-react";
import {
  cn,
  DotmSquare12,
  TextShimmer,
} from "@workspace/ui";

import type { CanvasAgentFeedStore } from "./canvas-agent-feed";
import type {
  CanvasAgentFeedBatch,
  CanvasAgentFeedEntry,
  CanvasAgentFeedSnapshot,
} from "./canvas-agent-feed";
import {
  summarizeConsecutiveEntries,
  type SummarizedFeedRow,
} from "./canvas-agent-feed-summarize";
import type { CanvasAgentFeedKind } from "./canvas-agent-feed-labels";
import type { CanvasAgentBridgeState } from "./use-canvas-agent-bridge";

const PANEL_TRANSITION = {
  duration: 0.24,
  ease: [0.22, 1, 0.36, 1] as const,
};

const ISLAND_LAYOUT_TRANSITION = {
  layout: {
    duration: 0.28,
    ease: [0.22, 1, 0.36, 1] as const,
  },
};

const GLASS_SHELL = cn(
  "border shadow-lg",
  "bg-background/50 text-foreground backdrop-blur-2xl backdrop-saturate-150",
  "border-border/50",
  "dark:bg-background/40 dark:border-border/40",
);

const MAX_HISTORY_ROWS = 100;

function kindIcon(kind: CanvasAgentFeedKind): LucideIcon {
  switch (kind) {
    case "read":
      return Eye;
    case "create":
      return Plus;
    case "edit":
      return Pencil;
    case "delete":
      return Trash2;
    case "move":
      return Move;
    case "layout":
      return LayoutGrid;
    case "navigate":
      return Maximize2;
    case "select":
      return MousePointer2;
    default:
      return Type;
  }
}

function formatTime(at: number): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(at));
}

function formatRowLabel(row: SummarizedFeedRow): string {
  return row.count > 1 ? `${row.label} ×${row.count}` : row.label;
}

export function CanvasAgentIsland({ bridge }: { bridge: CanvasAgentBridgeState }) {
  const snapshot = useFeedSnapshot(bridge.feed);
  const [expanded, setExpanded] = React.useState(false);
  const islandRef = React.useRef<HTMLDivElement>(null);
  const current = React.useMemo(
    () => pickCurrentEntry(snapshot),
    [snapshot],
  );
  const reducedMotion = usePrefersReducedMotion();

  useDismissOnOutsidePress(islandRef, expanded, () => setExpanded(false));

  if (!bridge.acceptsCommands || snapshot.batches.length === 0 || !current) {
    return null;
  }

  const isWorking = current.status === "active";

  return (
    <div
      ref={islandRef}
      className="pointer-events-none absolute bottom-4 right-4 z-[60] flex max-w-[min(100%,22rem)] flex-col-reverse items-end gap-2"
    >
      <AnimatePresence>
        {expanded ? (
          <motion.div
            key="canvas-agent-island-panel"
            initial={{ opacity: 0, y: 10, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={PANEL_TRANSITION}
            className="pointer-events-auto w-[min(100vw-2rem,20rem)]"
          >
            <ExpandedPanel batches={snapshot.batches} />
          </motion.div>
        ) : null}
      </AnimatePresence>

      <motion.button
        type="button"
        layout="size"
        layoutDependency={current.label}
        transition={
          reducedMotion ? { layout: { duration: 0 } } : ISLAND_LAYOUT_TRANSITION
        }
        aria-expanded={expanded}
        aria-label={isWorking ? "Agent working on canvas" : "Canvas agent activity"}
        onClick={() => setExpanded(v => !v)}
        className={cn(
          "pointer-events-auto flex h-8 max-w-[min(100%,20rem)] items-center gap-2 overflow-hidden rounded-full py-0 pl-2.5 pr-3",
          "transition-[transform,box-shadow] duration-200 ease-out",
          "hover:scale-[1.02] active:scale-[0.98]",
          GLASS_SHELL,
        )}
      >
        <DotmSquare12
          size={16}
          dotSize={2.5}
          className="size-4 shrink-0 text-foreground/90"
        />
        <IslandStatusLabel
          labelKey={current.requestId}
          label={current.label}
          isWorking={isWorking}
        />
      </motion.button>
    </div>
  );
}

function ExpandedPanel({ batches }: { batches: CanvasAgentFeedBatch[] }) {
  const reversed = [...batches].reverse();
  let rowCount = 0;

  return (
    <div
      role="dialog"
      aria-label="Canvas agent activity history"
      className={cn("overflow-hidden rounded-2xl", GLASS_SHELL)}
    >
      <div className="max-h-64 overflow-y-auto overscroll-contain px-3 py-2">
        {reversed.map((batch, batchIndex) => {
          const rows = summarizeConsecutiveEntries([...batch.entries].reverse());
          const visibleRows =
            rowCount >= MAX_HISTORY_ROWS
              ? []
              : rows.slice(0, Math.max(0, MAX_HISTORY_ROWS - rowCount));
          rowCount += visibleRows.length;
          if (visibleRows.length === 0) return null;

          return (
            <React.Fragment key={batch.id}>
              {batchIndex > 0 ? (
                <div className="my-2 border-t border-dashed border-border/60" aria-hidden />
              ) : null}
              <ul className="flex flex-col gap-1">
                {visibleRows.map(row => (
                  <HistoryRow key={row.id} row={row} />
                ))}
              </ul>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}

function HistoryRow({ row }: { row: SummarizedFeedRow }) {
  const Icon = row.label.includes("writing") ? Type : kindIcon(row.kind);

  return (
    <li className="flex items-center gap-2 rounded-lg px-1 py-1.5 text-xs">
      <Icon
        className={cn(
          "size-3.5 shrink-0",
          row.status === "error"
            ? "text-destructive"
            : row.status === "active"
              ? "text-emerald-500"
              : "text-muted-foreground",
        )}
        aria-hidden
      />
      <span
        className={cn(
          "min-w-0 flex-1 truncate",
          row.status === "active" ? "text-foreground" : "text-foreground/85",
        )}
      >
        {formatRowLabel(row)}
      </span>
      <time
        className="shrink-0 tabular-nums text-[10px] text-muted-foreground"
        dateTime={new Date(row.time).toISOString()}
      >
        {formatTime(row.time)}
      </time>
    </li>
  );
}

/**
 * Label slot — no motion wrapper around TextShimmer (see Footer ticker comment).
 * Keyed remount + tailwind `animate-in` handles enter transitions.
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
      className="block whitespace-nowrap text-sm font-medium animate-in fade-in slide-in-from-bottom-1 duration-200"
      aria-live="polite"
      aria-atomic
    >
      {isWorking ? (
        <TextShimmer as="span" duration={1.8}>
          {label}
        </TextShimmer>
      ) : (
        <span className="text-foreground/90">{label}</span>
      )}
    </span>
  );
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
      const root = rootRef.current;
      if (!root || root.contains(event.target as Node)) return;
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

function pickCurrentEntry(snapshot: CanvasAgentFeedSnapshot): CanvasAgentFeedEntry | null {
  if (snapshot.activeEntryId) {
    for (const batch of snapshot.batches) {
      for (const entry of batch.entries) {
        if (entry.requestId === snapshot.activeEntryId) return entry;
      }
    }
  }
  const lastBatch = snapshot.batches.at(-1);
  return lastBatch?.entries.at(-1) ?? null;
}

function useFeedSnapshot(store: CanvasAgentFeedStore) {
  return React.useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}

