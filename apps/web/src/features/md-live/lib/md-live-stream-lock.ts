"use client";

import { useEffect, useState } from "react";

const locked = new Set<string>();
const snapshots = new Map<string, string>();
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

export function lockMdLiveStream(path: string, snapshot?: string): void {
  locked.add(path);
  if (snapshot != null) snapshots.set(path, snapshot);
  notify();
}

export function unlockMdLiveStream(path: string): void {
  locked.delete(path);
  snapshots.delete(path);
  notify();
}

export function isMdLiveStreamLocked(path: string): boolean {
  return locked.has(path);
}

export function getMdLiveStreamSnapshot(path: string): string | null {
  return snapshots.get(path) ?? null;
}

/** Restore pre-stream bytes and drop the lock. Safe no-op if unlocked. */
export function restoreAndUnlockMdLiveStream(
  path: string,
  write: (content: string) => void,
): boolean {
  if (!locked.has(path)) return false;
  const snapshot = snapshots.get(path);
  if (snapshot != null) write(snapshot);
  unlockMdLiveStream(path);
  return true;
}

export function subscribeMdLiveStreamLock(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useMdLiveStreamLocked(path: string): boolean {
  const [isLocked, setIsLocked] = useState(() => locked.has(path));
  useEffect(() => {
    const sync = () => setIsLocked(locked.has(path));
    sync();
    return subscribeMdLiveStreamLock(sync);
  }, [path]);
  return isLocked;
}
