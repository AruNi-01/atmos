"use client";

import { useSyncExternalStore } from "react";

type ActivityState = {
  sessionId: string;
  status: string;
  until: number;
} | null;

let state: ActivityState = null;
const listeners = new Set<() => void>();
let clearTimer: ReturnType<typeof setTimeout> | null = null;

function emit() {
  for (const listener of listeners) listener();
}

export function markBrowserUseActivity(
  sessionId: string,
  status: string,
  active = true,
  holdMs = 2500,
): void {
  if (clearTimer) {
    clearTimeout(clearTimer);
    clearTimer = null;
  }
  if (!active) {
    state = null;
    emit();
    return;
  }
  state = { sessionId, status, until: Date.now() + holdMs };
  clearTimer = setTimeout(() => {
    state = null;
    emit();
  }, holdMs);
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): ActivityState {
  return state;
}

export function useBrowserUseActivity(sessionId?: string | null): {
  active: boolean;
  status: string;
} {
  const current = useSyncExternalStore(subscribe, getSnapshot, () => null);
  if (!current || Date.now() > current.until) {
    return { active: false, status: "" };
  }
  if (sessionId && current.sessionId !== sessionId) {
    return { active: false, status: "" };
  }
  return { active: true, status: current.status };
}
