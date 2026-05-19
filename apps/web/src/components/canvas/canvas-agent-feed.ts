"use client";

/**
 * In-memory feed of canvas agent commands for the Dynamic Island UI.
 * Not persisted — cleared when the tab reloads.
 *
 * Batches group commands that arrive close together (same agent "burst").
 * Each CLI/WebSocket dispatch has its own `request_id`.
 */

import {
  describeCanvasAgentCommand,
  type CanvasAgentFeedKind,
} from "./canvas-agent-feed-labels";

/** Gap between commands still considered one agent burst. */
export const CANVAS_AGENT_FEED_BATCH_GAP_MS = 2_500;

/** Raw dispatch records kept in memory (summarized UI shows up to 100 rows). */
const MAX_ENTRIES = 150;

export type CanvasAgentFeedEntryStatus = "active" | "done" | "error";

export interface CanvasAgentFeedEntry {
  requestId: string;
  command: string;
  kind: CanvasAgentFeedKind;
  label: string;
  status: CanvasAgentFeedEntryStatus;
  startedAt: number;
  completedAt: number | null;
}

export interface CanvasAgentFeedBatch {
  id: string;
  startedAt: number;
  entries: CanvasAgentFeedEntry[];
}

export interface CanvasAgentFeedSnapshot {
  batches: CanvasAgentFeedBatch[];
  activeEntryId: string | null;
}

const EMPTY_SNAPSHOT: CanvasAgentFeedSnapshot = {
  batches: [],
  activeEntryId: null,
};

export class CanvasAgentFeedStore {
  private batches: CanvasAgentFeedBatch[] = [];
  private listeners = new Set<() => void>();
  /** Stable reference between mutations — required by `useSyncExternalStore`. */
  private cachedSnapshot: CanvasAgentFeedSnapshot = EMPTY_SNAPSHOT;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): CanvasAgentFeedSnapshot => this.cachedSnapshot;

  begin(requestId: string, command: string, args?: Record<string, unknown> | null) {
    const { kind, label } = describeCanvasAgentCommand(command, args);
    const now = Date.now();
    const entry: CanvasAgentFeedEntry = {
      requestId,
      command,
      kind,
      label,
      status: "active",
      startedAt: now,
      completedAt: null,
    };

    const lastBatch = this.batches.at(-1);
    const lastEntry = lastBatch?.entries.at(-1);
    const sameBurst =
      lastBatch &&
      lastEntry &&
      now - lastEntry.startedAt <= CANVAS_AGENT_FEED_BATCH_GAP_MS;

    if (sameBurst && lastBatch) {
      lastBatch.entries.push(entry);
    } else {
      this.batches.push({
        id: `batch-${requestId}`,
        startedAt: now,
        entries: [entry],
      });
    }

    this.trim();
    this.emit();
  }

  complete(requestId: string, success: boolean) {
    const entry = this.findEntry(requestId);
    if (!entry) return;
    entry.status = success ? "done" : "error";
    entry.completedAt = Date.now();
    this.emit();
  }

  clear() {
    if (this.batches.length === 0) return;
    this.batches = [];
    this.emit();
  }

  getCurrentEntry(): CanvasAgentFeedEntry | null {
    const activeId = this.findActiveEntryId();
    if (activeId) {
      return this.findEntry(activeId);
    }
    for (let b = this.batches.length - 1; b >= 0; b -= 1) {
      const batch = this.batches[b];
      const last = batch?.entries.at(-1);
      if (last) return last;
    }
    return null;
  }

  private findActiveEntryId(): string | null {
    for (let b = this.batches.length - 1; b >= 0; b -= 1) {
      const batch = this.batches[b];
      if (!batch) continue;
      for (let e = batch.entries.length - 1; e >= 0; e -= 1) {
        const entry = batch.entries[e];
        if (entry?.status === "active") return entry.requestId;
      }
    }
    return null;
  }

  private findEntry(requestId: string): CanvasAgentFeedEntry | null {
    for (const batch of this.batches) {
      for (const entry of batch.entries) {
        if (entry.requestId === requestId) return entry;
      }
    }
    return null;
  }

  private trim() {
    let count = this.batches.reduce((n, b) => n + b.entries.length, 0);
    while (count > MAX_ENTRIES && this.batches.length > 0) {
      const first = this.batches[0];
      if (!first) break;
      if (first.entries.length <= 1) {
        this.batches.shift();
        count -= 1;
      } else {
        first.entries.shift();
        count -= 1;
      }
    }
  }

  private rebuildSnapshot() {
    if (this.batches.length === 0) {
      this.cachedSnapshot = EMPTY_SNAPSHOT;
      return;
    }
    this.cachedSnapshot = {
      batches: this.batches.map(batch => ({
        ...batch,
        entries: batch.entries.map(entry => ({ ...entry })),
      })),
      activeEntryId: this.findActiveEntryId(),
    };
  }

  private emit() {
    this.rebuildSnapshot();
    for (const listener of this.listeners) listener();
  }
}
