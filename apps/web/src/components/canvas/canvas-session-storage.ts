"use client";

import type { CanvasTldrawSession } from "./use-canvas-board";

const CANVAS_SESSION_STORAGE_KEY_PREFIX = "atmos.canvas.session";

export function getCanvasSessionStorageKey(boardGuid?: string | null): string {
  return `${CANVAS_SESSION_STORAGE_KEY_PREFIX}:${boardGuid ?? "default"}`;
}

export function readStoredCanvasSession(boardGuid?: string | null): CanvasTldrawSession | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const stored = window.localStorage.getItem(getCanvasSessionStorageKey(boardGuid));
    if (!stored) {
      return null;
    }
    const parsed = JSON.parse(stored) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    return parsed as CanvasTldrawSession;
  } catch {
    return null;
  }
}

export function writeStoredCanvasSession(session: CanvasTldrawSession, boardGuid?: string | null): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(getCanvasSessionStorageKey(boardGuid), JSON.stringify(session));
  } catch {
    // localStorage may be unavailable in restricted browser modes.
  }
}
