/**
 * Pending AppShot preview + auto-accept hold/resume.
 * Semantics aligned with apps/desktop/src-tauri/src/appshot/pending.rs
 */

export const PREVIEW_EXPIRES_IN_MS = 6_000;
export const NATIVE_AUTO_ACCEPT_GRACE_MS = 500;
export const RECOVERABLE_PENDING_TTL_MS = 5 * 60 * 1_000;
export const BLOCKED_PENDING_TTL_MS = 60 * 1_000;
export const MAX_PENDING_ENTRIES = 16;

export type PendingCapture = {
  previewId: string;
  appName: string;
  windowTitle: string | null;
  capturedAt: string;
  quality: string;
  screenshotPng: Buffer | null;
  screenshotPreviewBase64: string | null;
  contextMarkdown: string;
  sourceBounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  } | null;
  permissions: unknown[];
  warnings: string[];
  bundleId: string | null;
  processId: number | null;
  windowId: string | null;
  platform: "macos" | "windows" | "linux" | "unknown";
};

export type PendingEntry = {
  capture: PendingCapture;
  createdAtMs: number;
  expiresAtMs: number;
  blockedByPermissions: boolean;
  autoAcceptHeld: boolean;
  autoAcceptAfterMs: number | null;
  /** Set once accept wrote the record to disk. */
  savedTimestamp: string | null;
};

export type AutoAcceptState =
  | { kind: "missing" }
  | { kind: "held" }
  | { kind: "wait"; delayMs: number }
  | { kind: "ready" };

export class PendingStore {
  private entries = new Map<string, PendingEntry>();

  insert(
    capture: PendingCapture,
    nowMs: number = Date.now(),
  ): { expiresInMs: number } {
    this.prune(nowMs);
    const blocked = capture.permissions.some(
      (p) =>
        p &&
        typeof p === "object" &&
        "granted" in p &&
        (p as { granted: boolean }).granted === false,
    );
    if (blocked) {
      for (const [id, e] of this.entries) {
        if (e.blockedByPermissions) this.entries.delete(id);
      }
    }
    this.enforceCapacity();
    const expiresInMs = blocked ? 0 : PREVIEW_EXPIRES_IN_MS;
    this.entries.set(capture.previewId, {
      capture,
      createdAtMs: nowMs,
      expiresAtMs:
        nowMs + (blocked ? BLOCKED_PENDING_TTL_MS : RECOVERABLE_PENDING_TTL_MS),
      blockedByPermissions: blocked,
      autoAcceptHeld: false,
      autoAcceptAfterMs: blocked
        ? null
        : nowMs + PREVIEW_EXPIRES_IN_MS + NATIVE_AUTO_ACCEPT_GRACE_MS,
      savedTimestamp: null,
    });
    return { expiresInMs };
  }

  get(previewId: string): PendingEntry | undefined {
    return this.entries.get(previewId);
  }

  take(previewId: string): PendingEntry | undefined {
    const e = this.entries.get(previewId);
    if (e) this.entries.delete(previewId);
    return e;
  }

  restore(previewId: string, entry: PendingEntry): void {
    this.entries.set(previewId, entry);
  }

  setAutoAcceptHold(
    previewId: string,
    held: boolean,
    resumeInMs?: number | null,
    nowMs: number = Date.now(),
  ): void {
    this.prune(nowMs);
    const entry = this.entries.get(previewId);
    if (!entry) return;
    entry.autoAcceptHeld = held;
    if (!held) {
      const delay = Math.max(500, resumeInMs ?? PREVIEW_EXPIRES_IN_MS);
      entry.autoAcceptAfterMs =
        nowMs + delay + NATIVE_AUTO_ACCEPT_GRACE_MS;
    }
  }

  autoAcceptState(
    previewId: string,
    nowMs: number = Date.now(),
  ): AutoAcceptState {
    this.prune(nowMs);
    const entry = this.entries.get(previewId);
    if (!entry) return { kind: "missing" };
    if (entry.blockedByPermissions) return { kind: "missing" };
    if (entry.autoAcceptHeld) return { kind: "held" };
    if (entry.autoAcceptAfterMs == null) return { kind: "missing" };
    if (nowMs < entry.autoAcceptAfterMs) {
      return {
        kind: "wait",
        delayMs: Math.max(1, entry.autoAcceptAfterMs - nowMs),
      };
    }
    return { kind: "ready" };
  }

  prune(nowMs: number = Date.now()): void {
    for (const [id, e] of this.entries) {
      if (e.expiresAtMs <= nowMs) this.entries.delete(id);
    }
  }

  clear(): void {
    this.entries.clear();
  }

  private enforceCapacity(): void {
    while (this.entries.size >= MAX_PENDING_ENTRIES) {
      let oldestId: string | null = null;
      let oldest = Infinity;
      for (const [id, e] of this.entries) {
        if (e.createdAtMs < oldest) {
          oldest = e.createdAtMs;
          oldestId = id;
        }
      }
      if (oldestId) this.entries.delete(oldestId);
      else break;
    }
  }
}

export const globalPendingStore = new PendingStore();
