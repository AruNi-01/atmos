/**
 * In-memory feed of agent commands for the bottom-right activity island.
 * Not persisted — cleared when the tab reloads.
 *
 * Shared by Canvas and Prototype Design. Feature code supplies labels.
 */

export type AgentSurfaceFeedKind =
  | "read"
  | "create"
  | "edit"
  | "delete"
  | "move"
  | "layout"
  | "navigate"
  | "select";

export type AgentSurfaceCommandDescriptor = {
  kind: AgentSurfaceFeedKind;
  label: string;
};

export type AgentSurfaceDescribeCommand = (
  command: string,
  args?: Record<string, unknown> | null,
) => AgentSurfaceCommandDescriptor;

/** Gap between commands still considered one agent burst. */
export const AGENT_SURFACE_FEED_BATCH_GAP_MS = 2_500;

/** Raw dispatch records kept in memory (summarized UI shows up to 100 rows). */
const MAX_ENTRIES = 150;

/** Active entries older than this are auto-closed (stale dispatch / missed complete). */
export const AGENT_SURFACE_FEED_STALE_MS = 45_000;

export type AgentSurfaceFeedEntryStatus = "active" | "done" | "error";

export interface AgentSurfaceFeedScreenshot {
  dataUrl: string;
  width: number;
  height: number;
}

export interface AgentSurfaceFeedEntry {
  requestId: string;
  command: string;
  kind: AgentSurfaceFeedKind;
  label: string;
  status: AgentSurfaceFeedEntryStatus;
  startedAt: number;
  completedAt: number | null;
  screenshot?: AgentSurfaceFeedScreenshot | null;
}

export interface AgentSurfaceFeedBatch {
  id: string;
  startedAt: number;
  entries: AgentSurfaceFeedEntry[];
}

export interface AgentSurfaceFeedSnapshot {
  batches: AgentSurfaceFeedBatch[];
  activeEntryId: string | null;
}

const EMPTY_SNAPSHOT: AgentSurfaceFeedSnapshot = {
  batches: [],
  activeEntryId: null,
};

export class AgentSurfaceFeedStore {
  private batches: AgentSurfaceFeedBatch[] = [];
  private listeners = new Set<() => void>();
  /** Stable reference between mutations — required by `useSyncExternalStore`. */
  private cachedSnapshot: AgentSurfaceFeedSnapshot = EMPTY_SNAPSHOT;

  constructor(private readonly describe: AgentSurfaceDescribeCommand) {}

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): AgentSurfaceFeedSnapshot => this.cachedSnapshot;

  begin(requestId: string, command: string, args?: Record<string, unknown> | null) {
    this.expireStaleActive(AGENT_SURFACE_FEED_STALE_MS);

    const existing = this.findEntry(requestId);
    if (existing) {
      const { kind, label } = this.describe(command, args);
      existing.command = command;
      existing.kind = kind;
      existing.label = label;
      existing.status = "active";
      existing.startedAt = Date.now();
      existing.completedAt = null;
      existing.screenshot = null;
      this.emit();
      return;
    }

    const { kind, label } = this.describe(command, args);
    const now = Date.now();
    const entry: AgentSurfaceFeedEntry = {
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
      lastBatch && lastEntry && now - lastEntry.startedAt <= AGENT_SURFACE_FEED_BATCH_GAP_MS;

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
    let touched = false;
    for (const batch of this.batches) {
      for (const entry of batch.entries) {
        if (entry.requestId === requestId && entry.status === "active") {
          entry.status = success ? "done" : "error";
          entry.completedAt = Date.now();
          touched = true;
        }
      }
    }
    if (touched) {
      this.expireStaleActive(AGENT_SURFACE_FEED_STALE_MS);
      this.emit();
    }
  }

  finalizeRequest(
    requestId: string,
    success: boolean,
    extras?: { screenshot?: AgentSurfaceFeedScreenshot | null },
  ) {
    let attachedScreenshot = false;
    let wasActive = false;
    if (extras?.screenshot?.dataUrl?.startsWith("data:")) {
      const entry = this.findEntry(requestId);
      if (entry) {
        wasActive = entry.status === "active";
        entry.screenshot = {
          dataUrl: extras.screenshot.dataUrl,
          width: extras.screenshot.width,
          height: extras.screenshot.height,
        };
        attachedScreenshot = true;
      }
    }
    this.complete(requestId, success);
    this.expireStaleActive(AGENT_SURFACE_FEED_STALE_MS);
    if (attachedScreenshot && !wasActive) this.emit();
  }

  expireStaleActive(maxAgeMs: number) {
    const now = Date.now();
    let touched = false;
    for (const batch of this.batches) {
      for (const entry of batch.entries) {
        if (entry.status === "active" && now - entry.startedAt > maxAgeMs) {
          entry.status = "error";
          entry.completedAt = now;
          touched = true;
        }
      }
    }
    if (touched) this.emit();
  }

  clear() {
    if (this.batches.length === 0) return;
    this.batches = [];
    this.emit();
  }

  getCurrentEntry(): AgentSurfaceFeedEntry | null {
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

  private findEntry(requestId: string): AgentSurfaceFeedEntry | null {
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
      batches: this.batches.map((batch) => ({
        ...batch,
        entries: batch.entries.map((entry) => ({ ...entry })),
      })),
      activeEntryId: this.findActiveEntryId(),
    };
  }

  private emit() {
    this.rebuildSnapshot();
    for (const listener of this.listeners) listener();
  }
}

export function screenshotFromToolData(data: unknown): AgentSurfaceFeedScreenshot | null {
  if (!data || typeof data !== "object") return null;
  const rec = data as Record<string, unknown>;
  const dataUrl =
    typeof rec.dataUrl === "string"
      ? rec.dataUrl
      : typeof rec.data_url === "string"
        ? rec.data_url
        : "";
  if (!dataUrl.startsWith("data:")) return null;
  return {
    dataUrl,
    width: typeof rec.width === "number" ? rec.width : 0,
    height: typeof rec.height === "number" ? rec.height : 0,
  };
}
